#!/bin/bash

# 現在の日時を取得してファイル名を生成
current_date=$(date '+%Y%m%d_%H%M%S')
output_file="./public/static/podcast_${current_date}.mp3"

# ディレクトリが存在することを確認
mkdir -p "./public/static"

# Save the podcast file from the API response
curl -sS -X POST http://localhost:8787/generate-podcast \
  -H "Content-Type: application/json" \
  -H "Accept: application/octet-stream" \
  -d @src/speak.json \
  --output "${output_file}"

# 終了コードを確認
if [ $? -eq 0 ]; then
    echo "Podcast has been successfully saved to ${output_file}"
    echo "Generated file size: $(ls -lh "${output_file}" | awk '{print $5}')"
    
    # ファイルが実際に生成されたか確認
    if [ -f "${output_file}" ] && [ -s "${output_file}" ]; then
        echo "✅ File verification successful"
    else
        echo "❌ Error: File was not generated or is empty"
        exit 1
    fi
else
    echo "❌ Error: Failed to generate podcast"
    exit 1
fi