# Order of options doesn't matter – they get sorted automatically by priority
# Check licenses in ./ that match /.+\.ts/ js regexp
# Ignore files that match "deps.ts" regexp pattern
# Look for license with this pattern (when license is regexp it cannot be prepended!)
# Prepend license to the top of the file when

deno run $1 ./src/cli.ts \
$2 \
-i ./ "/.+\.ts/" \
-e "deps.ts" \
-l "// Copyright 2024 Im-Beast. All rights reserved. MIT license." \


