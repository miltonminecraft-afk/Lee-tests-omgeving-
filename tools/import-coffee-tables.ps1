$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot
$catalog = Get-Content -LiteralPath (Join-Path $projectRoot '.local/polyhaven-coffee-tables.json') -Raw | ConvertFrom-Json -AsHashtable
$entries = [ordered]@{}
function Save-AssetFile($item, $destination) {
    $uri = [Uri]$item.url
    if ($uri.Scheme -ne 'https' -or $uri.Host -ne 'dl.polyhaven.org') { throw 'Unexpected download host' }
    $parent = Split-Path $destination
    New-Item -ItemType Directory -Path $parent -Force | Out-Null
    if ((Test-Path -LiteralPath $destination) -and ((Get-FileHash -LiteralPath $destination -Algorithm MD5).Hash.ToLowerInvariant() -eq $item.md5)) { return }
    Invoke-WebRequest -Uri $uri.AbsoluteUri -OutFile ($destination + '.download')
    if ((Get-FileHash -LiteralPath ($destination + '.download') -Algorithm MD5).Hash.ToLowerInvariant() -ne $item.md5) { throw "Checksum mismatch: $destination" }
    Move-Item -LiteralPath ($destination + '.download') -Destination $destination -Force
}
foreach ($id in ($catalog.Keys | Sort-Object)) {
    if ($id -notmatch '^[A-Za-z0-9_]+$') { throw 'Unexpected asset ID' }
    $files = Invoke-RestMethod -Uri ('https://api.polyhaven.com/files/' + $id)
    $asset = $files.gltf.'4k'.gltf
    if (-not $asset) { throw "No 4K glTF: $id" }
    $assetRoot = Join-Path $projectRoot ('images/models/' + $id)
    Save-AssetFile $asset (Join-Path $assetRoot 'table.gltf')
    foreach ($file in $asset.include.PSObject.Properties) {
        if ($file.Name -match '\.\.' -or [IO.Path]::IsPathRooted($file.Name)) { throw 'Unexpected relative file path' }
        Save-AssetFile $file.Value (Join-Path $assetRoot $file.Name)
    }
    $source = 'https://polyhaven.com/a/' + $id
    Set-Content -LiteralPath (Join-Path $assetRoot 'LICENSE.txt') -Value ($catalog[$id].name + "`nSource: " + $source + "`nLicense: CC0 1.0 — https://polyhaven.com/license`nOriginal 4K glTF and textures. Downloaded 2026-10-22. MD5 checksums verified against the official API.")
    $entries[$id] = @{title=$catalog[$id].name;type='furniture';category='coffee-table';url=('images/models/'+$id+'/table.gltf');source=$source;license='CC0'}
    Write-Output ('IMPORTED ' + $id)
}
$output = 'export const COFFEE_TABLE_ASSETS = ' + ($entries | ConvertTo-Json -Depth 5) + ';'
Set-Content -LiteralPath (Join-Path $projectRoot 'js/coffee-table-assets.js') -Value $output
Write-Output ('ALL_COFFEE_TABLES_READY ' + $entries.Count)
