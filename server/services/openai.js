import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export class OpenAIService {
  /**
   * Generate both title and clarifying questions for a research topic in a single API call
   * @param {string} researchTopic - The original research topic/question
   * @returns {Promise<Object>} Object containing title and questions
   */
  static async generateTitleAndQuestions(researchTopic) {
    try {
      console.log('=== OpenAI: Generating title and clarifying questions ===', { researchTopic });
      
      const prompt = `
  You are a highly intelligent research assistant. Your job is to analyze the given research topic and do two things:
  
  1. Generate a clear, descriptive research title (3-8 words) that captures the essence of the topic.
  2. Generate 2-4 thoughtful clarifying questions that would help refine or better understand the user's research focus.
  
  Clarifying questions should explore possible ambiguities or missing details. For example, if the topic is "cricket", ask questions like:
  - "Are you focusing on a particular team, tournament, or the sport in general?"
  - "Do you want to study cricket from a historical, statistical, or cultural perspective?"
  
  Research Topic: "${researchTopic}"
  
  Return your response strictly as a JSON object in this format:
  {
    "title": "Your generated title here",
    "questions": ["Question 1", "Question 2", "Question 3"]
  }
  
  Guidelines:
  - The title must be concise, specific, and relevant to the topic. If the topic is too vague, end the title with "..." to indicate it needs clarification.
  - The questions must aim to narrow down scope, specify intent, or clarify focus.
  - Do NOT include any text, notes, or explanations outside the JSON.
  `;

      const response = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7,
        max_tokens: 800
      });

      const content = response.choices[0].message.content.trim();
      console.log('=== OpenAI: Raw response for title and questions ===', content);
      
      const result = JSON.parse(content);
      console.log('=== OpenAI: Parsed title and questions ===', result);
      
      return {
        success: true,
        title: result.title,
        questions: result.questions
      };
    } catch (error) {
      console.error('=== OpenAI: Error generating title and questions ===', error);
      return {
        success: false,
        error: 'Failed to generate title and questions',
        title: 'Research Topic...',
        questions: []
      };
    }
  }

  /**
   * Generate a comprehensive research page based on original topic and answers to clarifying questions
   * @param {string} originalTopic - The original research topic
   * @param {Array} clarifyingQuestions - The clarifying questions that were asked
   * @param {Array} answers - The user's answers to the clarifying questions
   * @returns {Promise<Object>} Research page content
   */
  static async generateResearchPage(originalTopic, clarifyingQuestions, answers) {
    try {
      console.log('=== OpenAI: Generating research page ===', { originalTopic, clarifyingQuestions, answers });
  
      // Create Q&A context string
      const qaContext = clarifyingQuestions.map((question, index) => 
        `Q${index + 1}: ${question}\nA${index + 1}: ${answers[index] || 'No answer provided'}`
      ).join('\n\n');
  
      // Define the prompt
      const prompt = `
  You are an expert research assistant. Using the original research topic and the clarifying questions and answers provided, generate a complete, professional research page.
  
  Original Research Topic:
  "${originalTopic}"
  
  Clarifying Questions and Answers:
  ${qaContext}
  
  Your goal is to produce a refined, detailed research document that demonstrates academic depth and logical structure.
  
  The research page must include the following sections:
  
  1. **Refined Research Question or Topic** — Rewrite the research topic into a precise and well-defined question or statement based on the clarifications.
  2. **Background & Context** — Provide a brief overview of the topic's importance, relevance, and background.
  3. **Research Objectives** — Clearly outline 3-5 key objectives or goals of the research.
  4. **Proposed Methodology** — Suggest suitable research methods (qualitative, quantitative, experimental, etc.) and justify why they fit the topic.
  5. **Scope & Limitations** — Define the scope of the study, including what will and will not be covered, and mention any foreseeable challenges.
  6. **Key Considerations** — Highlight ethical, practical, or contextual considerations relevant to the research.
  7. **Potential Sources & Further Directions** — List suggested data sources, references, and possible future extensions of the study.
  8. **Expected Outcomes or Insights** — Briefly describe the potential results or contributions this research could make.
  
  Formatting requirements:
  - Return the entire research page in **Markdown format**.
  - Use clear section headings (#, ##, ###, etc.) for readability.
  - Maintain a **formal, academic tone** suitable for professional or university-level research.
  - Do **not** include any preamble, commentary, or explanations outside the research page.
  
  Output only the Markdown-formatted research page.
  `;
  
      // Make OpenAI API call
      const response = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7,
        max_tokens: 4000
      });
  
      const researchContent = response.choices[0].message.content.trim();
      console.log('=== OpenAI: Generated research page preview ===', researchContent.substring(0, 200) + '...');
  
      return {
        success: true,
        researchPage: researchContent,
        originalTopic,
        clarifyingQuestions,
        answers
      };
  
    } catch (error) {
      console.error('=== OpenAI: Error generating research page ===', error);
      return {
        success: false,
        error: 'Failed to generate research page'
      };
    }
  }
}