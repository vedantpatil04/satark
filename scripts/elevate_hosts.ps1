$cmd = "$c = (Get-Content C:\Windows\System32\drivers\etc\hosts) | Where-Object { $_ -notmatch 'satark' }; $c += '`r`n127.0.0.1 satark.test`r`n10.106.76.118 satark.test`r`n127.0.0.1 satark.local`r`n10.106.76.118 satark.local`r`n'; Set-Content -Path C:\Windows\System32\drivers\etc\hosts -Value $c -Force; ipconfig /flushdns; certutil -addstore -f Root 'D:\satark-main\certs\ca.crt'"
$app = New-Object -ComObject Shell.Application
$app.ShellExecute("powershell.exe", "-NoProfile -ExecutionPolicy Bypass -Command `"$cmd`"", "", "runas", 1)

