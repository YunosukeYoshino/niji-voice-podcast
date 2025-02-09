import { Hono } from "hono";
import { serveStatic } from "hono/cloudflare-workers";
import { z } from "zod";

const app = new Hono<Env>();
type Env = {
  Bindings: {
    NIJIVOICE_API_KEY: string;
    CHAR_01: string;
    CHAR_02: string;
  };
};
// ダイアログのバリデーション
const dialogueSchema = z.object({
  dialogue: z.array(
    z.object({
      speaker: z.string(),
      line: z.string().min(1),
    })
  ),
});

app.post("/generate-podcast", async (c) => {
  try {
    const body = await c.req.json();
    console.log("Received request body:", body);
    const parsed = dialogueSchema.safeParse(body);

    if (!parsed.success) {
      console.error("Validation error:", parsed.error.format());
      return c.json({ error: parsed.error.format() }, 400);
    }

    const dialogue = parsed.data.dialogue;
    console.log("Processing dialogue:", dialogue.length, "entries");

    // `c.env` をここで取得
    const API_KEY = c.env.NIJIVOICE_API_KEY;
    console.log("NijiVoice API key:", API_KEY);
    const speakerIdMap: Record<string, string> = {
      "risa": c.env.CHAR_01,
      "mina": c.env.CHAR_02,
    };

    const audioBuffers: ArrayBuffer[] = [];

    for (let i = 0; i < dialogue.length; i++) {
      const { speaker, line } = dialogue[i];
      const speakerId = speakerIdMap[speaker];

      if (!speakerId) {
        return c.json({ error: `スピーカー ${speaker} は無効です` }, 400);
      }

      const url = `https://api.nijivoice.com/api/platform/v1/voice-actors/${speakerId}/generate-voice`;
      const headers = {
        "accept": "application/json",
        "content-type": "application/json",
        "x-api-key": API_KEY,
      };

      console.log(`Sending request to NijiVoice API for speaker ${speaker}`);
      const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify({
          format: "mp3",
          script: line,
          speed: "1.0",
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`API error (${response.status}):`, errorText);
        throw new Error(`API呼び出しに失敗しました: ${response.status} ${errorText}`);
      }

      const data = await response.json();
      if (!data.generatedVoice?.audioFileUrl) {
        throw new Error("音声URLが見つかりません");
      }

      const audioUrl = data.generatedVoice.audioFileUrl;
      console.log(`Downloading audio from ${audioUrl}`);

      const audioResponse = await fetch(audioUrl);
      if (!audioResponse.ok) {
        throw new Error(`音声ファイルのダウンロードに失敗: ${audioResponse.status}`);
      }

      const audioBuffer = await audioResponse.arrayBuffer();
      audioBuffers.push(audioBuffer);
    }

    if (audioBuffers.length === 0) {
      throw new Error("音声ファイルが生成されませんでした");
    }

    // 音声データを結合
    const totalLength = audioBuffers.reduce((acc, buf) => acc + buf.byteLength, 0);
    const combinedBuffer = new Uint8Array(totalLength);
    let offset = 0;
    
    for (const buffer of audioBuffers) {
      combinedBuffer.set(new Uint8Array(buffer), offset);
      offset += buffer.byteLength;
    }

    // 日付フォーマットでファイル名を生成
    const now = new Date();
    const filename = `podcast_${now.toISOString().replace(/[-:.]/g, "").slice(0, 15)}.mp3`;
    const filepath = `/static/${filename}`;

    return new Response(combinedBuffer, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "X-Generated-Filepath": filepath
      },
    });

  } catch (error) {
    console.error("処理エラー:", error);
    return c.json({ 
      error: "音声生成エラー", 
      details: (error as Error).message
    }, 500);
  }
});

// 静的ファイルの配信
app.get("/static/*", serveStatic({
  root: "./public",
  manifest: ""
}));

export default app;