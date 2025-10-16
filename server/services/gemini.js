import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from 'dotenv'

dotenv.config()

const apiKey = process.env.GEMINI_API_KEY
let genAI = null
if (apiKey) {
  genAI = new GoogleGenerativeAI(apiKey)
}

export class GeminiService {
  /**
   * Generate a comprehensive research page using Gemini models
   * @param {string} originalTopic
   * @param {Array<string>} clarifyingQuestions
   * @param {Array<string>} answers
   * @returns {Promise<{success:boolean, researchPage?:string}>}
   */
  static async generateResearchPage(originalTopic, clarifyingQuestions, answers) {
    try {
      if (!genAI) {
        throw new Error('GEMINI_API_KEY is not configured')
      }

      const qaContext = (clarifyingQuestions || []).map((q, i) => {
        const a = (answers && answers[i]) ? answers[i] : 'No answer provided'
        return `Q${i + 1}: ${q}\nA${i + 1}: ${a}`
      }).join('\n\n')

      const prompt = `You are a research assistant. Create a comprehensive research page based on the original research topic and the clarifying questions and answers provided.\n\nOriginal Research Topic: "${originalTopic}"\n\nClarifying Questions and Answers:\n${qaContext}\n\nCreate a well-structured research page that includes:\n1. A refined research question/topic based on the clarifications\n2. Key research objectives\n3. Suggested research methodology\n4. Important considerations and scope\n5. Potential sources and directions for further research\n\nFormat the response in markdown.`

      const model = genAI.getGenerativeModel({ model: process.env.GEMINI_MODEL || 'gemini-1.5-pro' })
      const result = await model.generateContent({ contents: [{ role: 'user', parts: [{ text: prompt }] }] })
      const text = result.response?.text?.() || result.response?.candidates?.[0]?.content?.parts?.[0]?.text || ''

      return { success: true, researchPage: text }
    } catch (error) {
      console.error('=== Gemini: Error generating research page ===', error)
      return { success: false, error: 'Failed to generate research page' }
    }
  }

  /**
   * Summarize combined report into 2–3 paragraphs, ~150–200 words
   * @param {string} combinedMarkdown
   * @returns {Promise<{success:boolean, summary?:string}>}
   */
  static async summarizeCombinedReport(combinedMarkdown) {
    try {
      if (!genAI) throw new Error('GEMINI_API_KEY is not configured')
      const prompt = `Summarize the following combined research (includes sections from ChatGPT and Gemini) into 2 to 3 concise paragraphs, totaling about 150 to 200 words. Use neutral, professional tone. Do not include headings or lists.\n\nCONTENT START\n${combinedMarkdown}\nCONTENT END`
      const model = genAI.getGenerativeModel({ model: process.env.GEMINI_MODEL || 'gemini-1.5-pro' })
      const result = await model.generateContent({ contents: [{ role: 'user', parts: [{ text: prompt }] }] })
      const text = result.response?.text?.() || result.response?.candidates?.[0]?.content?.parts?.[0]?.text || ''
      return { success: true, summary: text.trim() }
    } catch (error) {
      console.error('=== Gemini: Error summarizing combined report ===', error)
      return { success: false, error: 'Failed to summarize combined report' }
    }
  }
}

export default { GeminiService }


