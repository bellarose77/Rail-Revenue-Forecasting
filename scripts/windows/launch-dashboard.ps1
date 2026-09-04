<#
.SYNOPSIS
    Silent one-click launcher for the Rail Revenue Forecasting Streamlit
    dashboard. Intended to be started hidden via Launch Dashboard.vbs (or a
    desktop shortcut pointing at that .vbs) -- not run directly in a visible
    console, though it works fine that way too for troubleshooting.

    Resolves the project root from its own location so it works regardless
    of the current working directory or how it was launched (double-click,
    shortcut, Task Scheduler, etc.). Reuses an already-running dashboard
    instead of starting a duplicate. Waits for the server to actually
    respond before opening the browser. Shows a Windows message box -- it
    never fails silently.
#>

$ErrorActionPreference = "Stop"

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$VenvDir = Join-Path $RepoRoot ".venv"
$VenvPython = Join-Path $VenvDir "Scripts\python.exe"
$AppEntry = Join-Path $RepoRoot "dashboard\streamlit\app.py"
$Requirements = Join-Path $RepoRoot "dashboard\streamlit\requirements.txt"
$Port = 8501
$Url = "http://127.0.0.1:$Port/"
$LogOut = Join-Path $env:TEMP "rail-revenue-forecasting-dashboard.out.log"
$LogErr = Join-Path $env:TEMP "rail-revenue-forecasting-dashboard.err.log"

function Format-ArgumentString([string[]]$ArgumentArray) {
    # Windows PowerShell 5.1's Start-Process -ArgumentList joins array
    # elements into a single command-line string WITHOUT quoting elements
    # that contain spaces, so an argument like "import streamlit" or a
    # project path with a space in it (e.g. "C:\Some User\...") silently
    # gets split into two argv entries by the child process. Build the
    # command-line string ourselves with correct quoting instead.
    return ($ArgumentArray | ForEach-Object {
        if ($_ -match '[\s"]') {
            '"' + ($_ -replace '"', '\"') + '"'
        } else {
            $_
        }
    }) -join ' '
}

function Show-FatalError([string]$Message) {
    Add-Type -AssemblyName System.Windows.Forms | Out-Null
    [System.Windows.Forms.MessageBox]::Show(
        $Message,
        "Rail Revenue Forecasting Dashboard - Startup Failed",
        [System.Windows.Forms.MessageBoxButtons]::OK,
        [System.Windows.Forms.MessageBoxIcon]::Error
    ) | Out-Null
}

function Get-LogTail {
    $lines = @()
    foreach ($file in @($LogErr, $LogOut)) {
        if (Test-Path -LiteralPath $file) {
            $lines += Get-Content -LiteralPath $file -Tail 20 -ErrorAction SilentlyContinue
        }
    }
    if ($lines.Count -eq 0) { return "(no log output captured)" }
    return ($lines -join "`r`n")
}

function Test-PortOpen([string]$ComputerName, [int]$PortNumber, [int]$TimeoutMs = 500) {
    try {
        $client = New-Object System.Net.Sockets.TcpClient
        $async = $client.BeginConnect($ComputerName, $PortNumber, $null, $null)
        $success = $async.AsyncWaitHandle.WaitOne($TimeoutMs)
        if ($success -and $client.Connected) {
            $client.EndConnect($async)
            $client.Close()
            return $true
        }
        $client.Close()
        return $false
    } catch {
        return $false
    }
}

function Test-HttpOk([string]$TargetUrl, [int]$TimeoutSec = 2) {
    try {
        $response = Invoke-WebRequest -Uri $TargetUrl -UseBasicParsing -TimeoutSec $TimeoutSec
        return ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500)
    } catch {
        return $false
    }
}

try {
    # 1. Confirm the dashboard entry point exists before doing anything else.
    if (-not (Test-Path -LiteralPath $AppEntry)) {
        Show-FatalError "Dashboard entry file not found:`r`n$AppEntry`r`n`r`nThe project layout may have changed. Reinstall or re-clone the repository."
        exit 1
    }

    # 2. If something is already answering on the port, reuse it instead of
    #    starting a duplicate server.
    if (Test-PortOpen -ComputerName "127.0.0.1" -PortNumber $Port) {
        if (Test-HttpOk -TargetUrl $Url) {
            Start-Process $Url
            exit 0
        } else {
            Show-FatalError "Port $Port is already in use by another application, and it did not respond like the Rail Revenue Forecasting dashboard.`r`n`r`nClose whatever is using port $Port and try again."
            exit 1
        }
    }

    # 3. Python virtual environment: create it if missing.
    if (-not (Test-Path -LiteralPath $VenvPython)) {
        $py = Get-Command "py" -ErrorAction SilentlyContinue
        if (-not $py) {
            $py = Get-Command "python" -ErrorAction SilentlyContinue
        }
        if (-not $py) {
            Show-FatalError "Python was not found on PATH.`r`n`r`nInstall Python 3.11 or newer from https://www.python.org/downloads/ (check 'Add python.exe to PATH' during install) and try again."
            exit 1
        }

        $createProc = Start-Process -FilePath $py.Source -ArgumentList (Format-ArgumentString @("-m", "venv", $VenvDir)) `
            -WorkingDirectory $RepoRoot -WindowStyle Hidden -Wait -PassThru `
            -RedirectStandardOutput $LogOut -RedirectStandardError $LogErr

        if ($createProc.ExitCode -ne 0 -or -not (Test-Path -LiteralPath $VenvPython)) {
            Show-FatalError "Failed to create the Python virtual environment at:`r`n$VenvDir`r`n`r`n$(Get-LogTail)"
            exit 1
        }
    }

    # 4. Make sure Streamlit (and the rest of dashboard/streamlit/requirements.txt)
    #    is actually installed; install it on first run if not.
    $checkProc = Start-Process -FilePath $VenvPython -ArgumentList (Format-ArgumentString @("-c", "import streamlit")) `
        -WorkingDirectory $RepoRoot -WindowStyle Hidden -Wait -PassThru `
        -RedirectStandardOutput $LogOut -RedirectStandardError $LogErr

    if ($checkProc.ExitCode -ne 0) {
        if (-not (Test-Path -LiteralPath $Requirements)) {
            Show-FatalError "Streamlit is not installed, and the requirements file is missing:`r`n$Requirements"
            exit 1
        }

        $installProc = Start-Process -FilePath $VenvPython -ArgumentList (Format-ArgumentString @("-m", "pip", "install", "-r", $Requirements)) `
            -WorkingDirectory $RepoRoot -WindowStyle Hidden -Wait -PassThru `
            -RedirectStandardOutput $LogOut -RedirectStandardError $LogErr

        if ($installProc.ExitCode -ne 0) {
            Show-FatalError "Failed to install dashboard dependencies from:`r`n$Requirements`r`n`r`n$(Get-LogTail)"
            exit 1
        }

        $checkProc = Start-Process -FilePath $VenvPython -ArgumentList @("-c", "import streamlit") `
            -WorkingDirectory $RepoRoot -WindowStyle Hidden -Wait -PassThru `
            -RedirectStandardOutput $LogOut -RedirectStandardError $LogErr

        if ($checkProc.ExitCode -ne 0) {
            Show-FatalError "Streamlit still isn't importable after installing dependencies.`r`n`r`n$(Get-LogTail)"
            exit 1
        }
    }

    # 5. Start Streamlit hidden, logging to a temp file for diagnostics.
    $streamlitArgs = Format-ArgumentString @(
        "-m", "streamlit", "run", $AppEntry,
        "--server.headless", "true",
        "--server.port", "$Port",
        "--browser.gatherUsageStats", "false"
    )
    $streamlitProc = Start-Process -FilePath $VenvPython -ArgumentList $streamlitArgs `
        -WorkingDirectory $RepoRoot -WindowStyle Hidden -PassThru `
        -RedirectStandardOutput $LogOut -RedirectStandardError $LogErr

    # 6. Wait (up to 60s) for it to actually respond; bail out early if the
    #    process dies before that.
    $ready = $false
    for ($i = 0; $i -lt 60; $i++) {
        if ($streamlitProc.HasExited) { break }
        if (Test-PortOpen -ComputerName "127.0.0.1" -PortNumber $Port) {
            if (Test-HttpOk -TargetUrl $Url) { $ready = $true; break }
        }
        Start-Sleep -Seconds 1
    }

    if (-not $ready) {
        Show-FatalError "The Streamlit dashboard did not start within 60 seconds.`r`n`r`n$(Get-LogTail)`r`n`r`nFull logs:`r`n$LogOut`r`n$LogErr"
        exit 1
    }

    # 7. It's up -- open it.
    Start-Process $Url
}
catch {
    Show-FatalError "Unexpected error while starting the dashboard:`r`n$($_.Exception.Message)"
    exit 1
}
