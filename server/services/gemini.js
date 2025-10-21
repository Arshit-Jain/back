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

      const qaContext = (clarifyingQuestions && clarifyingQuestions.length > 0) 
        ? clarifyingQuestions.map((q, i) => {
            const a = (answers && answers[i]) ? answers[i] : 'No answer provided'
            return `Q${i + 1}: ${q}\nA${i + 1}: ${a}`
          }).join('\n\n')
        : 'No specific clarifying questions were provided. Generate comprehensive research based on the topic itself.';

      const prompt = `You are a research assistant. Create a comprehensive research page based on the original research topic${clarifyingQuestions && clarifyingQuestions.length > 0 ? ' and the clarifying questions and answers provided' : ''}.

Original Research Topic: "${originalTopic}"

${clarifyingQuestions && clarifyingQuestions.length > 0 ? `
Clarifying Questions and Answers:
${qaContext}
` : `
Research Context:
${qaContext}
`}

Create a well-structured research page that includes:
1. A refined research question/topic based on the clarifications
2. Key research objectives
3. Suggested research methodology
4. Important considerations and scope
5. Potential sources and directions for further research
6. Write about 1000 to 2000 words.

CRITICAL FORMATTING REQUIREMENTS:
- Use clean, professional formatting
- ABSOLUTELY NO BOLD FORMATTING - Never use **text** or *text* for emphasis
- Use simple headings with # and ## only
- Make links clean and readable: "Link text (URL)" instead of markdown links
- Use bullet points with - instead of numbered lists where appropriate
- Keep paragraphs concise and well-spaced
- Do not include provider names (Gemini, Google) or headers in the content
- Avoid ALL markdown formatting except basic headings (#, ##) and bullet points (-)
- No asterisks (*) for emphasis or bold - they will be removed
- Use plain text throughout the document

Format the response in clean markdown WITHOUT any bold formatting.`

      const model = genAI.getGenerativeModel({ model: process.env.GEMINI_MODEL || 'gemini-2.5-pro' })
      const result = await model.generateContent({ contents: [{ role: 'user', parts: [{ text: prompt }] }] })
      let text = result.response?.text?.() || result.response?.candidates?.[0]?.content?.parts?.[0]?.text || ''

      // Aggressively remove any bold formatting that Gemini might have added
      text = text
        .replace(/\*\*\*([^*]+)\*\*\*/g, '$1')  // Triple asterisks
        .replace(/\*\*([^*]+)\*\*/g, '$1')       // Double asterisks
        .replace(/\*\*([^*\n]+)\*\*/g, '$1')     // Double asterisks (no newline)
        .replace(/\*\*([^*\n]*?)\*\*/g, '$1')    // Double asterisks (lazy)
        .replace(/\*\*([^*]*?)\*\*/g, '$1')      // Double asterisks (very lazy)
        .replace(/\*([^*]+)\*/g, '$1')           // Single asterisks
        .replace(/\*\*/g, '')                     // Any remaining **
        .replace(/\*/g, '')                       // Any remaining *
        // Second pass
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/\*\*/g, '')
        // Third pass for nested
        .replace(/\*+([^*\n]+)\*+/g, '$1')
        .replace(/\*\*/g, '')
        .replace(/\*/g, '');

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
      
      const prompt = `Summarize the following combined research (includes sections from ChatGPT and Gemini) into 2 to 3 concise paragraphs, totaling about 150 to 200 words. Use neutral, professional tone. 

IMPORTANT: Do not use any bold formatting (**text** or *text*). Use plain text only. Do not include headings or lists. Just write clear, simple paragraphs.

CONTENT START
${combinedMarkdown}
CONTENT END`

      const model = genAI.getGenerativeModel({ model: process.env.GEMINI_MODEL || 'gemini-2.5-pro' })
      const result = await model.generateContent({ contents: [{ role: 'user', parts: [{ text: prompt }] }] })
      let text = result.response?.text?.() || result.response?.candidates?.[0]?.content?.parts?.[0]?.text || ''
      
      // Remove any bold formatting from the summary
      text = text
        .replace(/\*\*\*([^*]+)\*\*\*/g, '$1')
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/\*\*([^*\n]+)\*\*/g, '$1')
        .replace(/\*\*([^*\n]*?)\*\*/g, '$1')
        .replace(/\*\*([^*]*?)\*\*/g, '$1')
        .replace(/\*([^*]+)\*/g, '$1')
        .replace(/\*\*/g, '')
        .replace(/\*/g, '')
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/\*\*/g, '')
        .replace(/\*+([^*\n]+)\*+/g, '$1')
        .replace(/\*\*/g, '')
        .replace(/\*/g, '')
        .trim();
      
      return { success: true, summary: text }
    } catch (error) {
      console.error('=== Gemini: Error summarizing combined report ===', error)
      return { success: false, error: 'Failed to summarize combined report' }
    }
  }
}

export default { GeminiService }