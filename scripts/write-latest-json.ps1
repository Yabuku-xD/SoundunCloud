param(
  [Parameter(Mandatory = $true)]
  [string]$Version,

  [Parameter(Mandatory = $true)]
  [string]$Notes,

  [string]$Owner = "Yabuku-xD",
  [string]$Repo = "SoundunCloud",
  [string]$BundlePath = "src-tauri\target\release\bundle\nsis\SoundunCloud_${Version}_x64-setup.exe",
  [string]$OutputPath = "src-tauri\target\release\bundle\latest.json"
)

$resolvedBundlePath = Resolve-Path $BundlePath
$signaturePath = "$($resolvedBundlePath.Path).sig"

if (-not (Test-Path $signaturePath)) {
  throw "Missing updater signature file: $signaturePath"
}

$signature = (Get-Content $signaturePath -Raw).Trim()
$bundleName = Split-Path $resolvedBundlePath.Path -Leaf
$downloadUrl = "https://github.com/$Owner/$Repo/releases/download/v$Version/$bundleName"

$payload = [ordered]@{
  version = $Version
  notes = $Notes
  pub_date = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
  platforms = [ordered]@{
    "windows-x86_64" = [ordered]@{
      signature = $signature
      url = $downloadUrl
    }
  }
}

$outputDirectory = Split-Path $OutputPath -Parent
if (-not (Test-Path $outputDirectory)) {
  New-Item -ItemType Directory -Path $outputDirectory | Out-Null
}

$payload | ConvertTo-Json -Depth 6 | Set-Content $OutputPath
Write-Host "Wrote $OutputPath"
