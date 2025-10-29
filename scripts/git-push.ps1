# Initialize git if missing
if (-not (Test-Path .git)) {
    git init
}

# Stage everything
git add .

# Commit (if there are staged changes)
& git commit -m "chore: initial project commit" 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "commit skipped or failed (maybe nothing to commit)"
}

# Ensure branch main
git branch -M main 2>$null

# Replace remote if exists
try { git remote remove origin 2>$null } catch {}

# Add remote
git remote add origin https://github.com/ShamWuo/RS-code-simulator.git

# Push
git push -u origin main
