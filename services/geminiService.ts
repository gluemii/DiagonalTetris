
import { GoogleGenAI } from "@google/genai";

export const getAICommentary = async (
  score: number, 
  linesCleared: number, 
  isGameOver: boolean,
  diagonalClears: number = 0
): Promise<string> => {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
    
    let prompt = `You are a hype-man and expert coach for a professional Tetris player. 
    The current score is ${score} and they have cleared ${linesCleared} total lines. `;
    
    if (isGameOver) {
      prompt += "The game just ended. Give them a short, encouraging final message in Korean about their score and how they did. Keep it under 2 sentences.";
    } else {
      if (diagonalClears > 0) {
        prompt += `They just cleared ${diagonalClears} diagonal lines! This is a rare and high-skill move. Give them a super excited, 1-sentence cheer in Korean specifically mentioning the diagonal clear.`;
      } else {
        prompt += "They just cleared some horizontal lines! Give them a quick, exciting, 1-sentence cheer in Korean. Be cool and professional.";
      }
    }

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        systemInstruction: "You are a friendly Korean-speaking Tetris AI commentator named 'Neon-Bot'. You use energetic and gamer-friendly language. You are especially impressed by diagonal clears which are worth double points.",
        temperature: 0.8,
      }
    });

    return response.text || "멋진 플레이네요! 계속해서 한계를 돌파하세요!";
  } catch (error) {
    console.error("Gemini commentary failed", error);
    return "대단한 실력이네요! 다음 블록에 집중하세요.";
  }
};
