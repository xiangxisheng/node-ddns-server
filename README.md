# 采用node.js编写DDNS服务端

DDNS服务器采用UDP协议接收客户端的IP地址，然后提交到dnspod更新域名解析记录
优点：原理简单、流量消耗低、性能强


### 在Windows下运行DDNS服务端
配置环境变量DNSPOD_DOMAIN和DNSPOD_LOGIN_TOKEN
然后直接打开node-ddns-server.bat即可启动服务


### indows客户端安装脚本

```
@ECHO OFF
powershell -c "$mac=(Get-NetAdapter -InterfaceIndex (Get-NetIPAddress -AddressFamily IPv6|Where-Object {$_.IPAddress -like '2*'} | Select-Object -First 1).InterfaceIndex).MacAddress;$path=\"HKLM:\Software\Firadio\";if (-not (Test-Path $path)) {New-Item -Force -Path $path >$null;};Set-ItemProperty -Path $path -Name \"g\" -Value $mac;"
schtasks /end /tn "v6.fm20.cn"
schtasks /create /F /TN "v6.fm20.cn" /RU "SYSTEM" /SC MINUTE /MO 1 /TR "powershell -c \"$c=New-Object Net.Sockets.UdpClient([Net.Sockets.AddressFamily]::InterNetworkV6);for(){$v=gp -Pa \\\"HKLM:\SOFTWARE\Firadio\\\" -N \\\"g\\\";$m=[Text.Encoding]::UTF8.GetBytes($v.g);$c.Send($m,$m.Length,\\\"v6.fm20.cn\\\",1);sleep 1}\""
schtasks /run /tn "v6.fm20.cn"
PAUSE
```

### Linux客户端
可使用tcc编译ddns-client-linux.c编译后加到crontab即可
