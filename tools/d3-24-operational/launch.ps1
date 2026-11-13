#Requires -Version 7.6
[CmdletBinding()]
param([switch]$CompositionReview,[switch]$V3Review,[switch]$V3VerifyPackage)
$ErrorActionPreference='Stop'
$modes=@($CompositionReview,$V3Review,$V3VerifyPackage | Where-Object { $_ })
if($modes.Count -ne 1){[Console]::WriteLine('D324_OPERATIONAL_RATIFICATION_REQUIRED');exit 1}
try {
 if($env:NODE_OPTIONS -or $env:NODE_PATH -or $PSVersionTable.PSVersion.ToString() -cne '7.6.9'){throw 'PIN'}
 $shell=(Get-Process -Id $PID).Path
 $nodePath=(Get-Command node.exe -CommandType Application -ErrorAction Stop | Select-Object -First 1).Source
 if((Get-FileHash -LiteralPath $shell).Hash -ine '2a6769a3330dc1084d0154bfde7d164ab750ca7f700f313f9d417c1be78b2233' -or
    (Get-FileHash -LiteralPath $nodePath).Hash -ine 'b3094d0b49f9ad602262a9921551737bb97637c05dd357a06ae98188d7290aa3'){throw 'PIN'}
 if($V3Review -or $V3VerifyPackage){
  $bootstrap=Join-Path $PSScriptRoot 'entry-bootstrap.mjs'
  if((Get-FileHash -LiteralPath $bootstrap).Hash -ine '453e1b5e88494609fce42895ab4943250ab349aee100ac78459255d172f00b56'){throw 'PIN'}
  $mode=if($V3Review){'--v3-review'}else{'--v3-verify-package'}
  & $nodePath $bootstrap $mode
  exit $LASTEXITCODE
 }
 $entry=Join-Path $PSScriptRoot 'live.mjs'
 if((Get-FileHash -LiteralPath $entry).Hash -ine 'a6bfab15b16e64530ce1f167e5b254d230bb4cece9c80d3c4e5be9cec4f97098'){throw 'PIN'}
 & $nodePath $entry --composition-review
 exit $LASTEXITCODE
}catch{[Console]::WriteLine('D324_COMPOSITION_REVIEW_REJECTED');exit 1}
