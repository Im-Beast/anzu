# Order of options doesn't matter – they get sorted automatically by priority
# Check licenses in ./ that match /.+\.ts/ js regexp
# Ignore files that match "deps.ts" regexp pattern
# Look for license with this pattern (when license is regexp it cannot be prepended!)
# Prepend license to the top of the file when

deno run ./src/cli.ts \
-i ./ "/.+\.ts/" \
-e "deps.ts" \
-l "// Copyright 2021 Im-Beast. All rights reserved. MIT license." \
-p

