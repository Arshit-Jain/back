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
        model: process.env.CHATGPT_MODEL || "gpt-5",
        messages: [{ role: "user", content: prompt }],
        max_completion_tokens: 800,
        response_format: { type: "json_object" }
      });

      const content = (response?.choices?.[0]?.message?.content || "").trim();
      console.log('=== OpenAI: Raw response for title and questions ===', content);
      
      if (!content) {
        throw new Error('Empty response from OpenAI API');
      }
      
      let result;
      try {
        result = JSON.parse(content);
      } catch (parseError) {
        console.error('=== OpenAI: JSON Parse Error ===', parseError);
        console.error('=== OpenAI: Raw content that failed to parse ===', content);
        
        const fencedMatch = content.match(/```json[\s\S]*?\{[\s\S]*?\}[\s\S]*?```/i) || content.match(/\{[\s\S]*\}/);
        if (fencedMatch) {
          const extracted = fencedMatch[0]
            .replace(/```json|```/gi, '')
            .trim();
          console.log('=== OpenAI: Extracted JSON ===', extracted);
          result = JSON.parse(extracted);
        } else {
          throw parseError;
        }
      }
      
      console.log('=== OpenAI: Parsed title and questions ===', result);
      
      if (!result || typeof result !== 'object') {
        throw new Error('Invalid JSON structure');
      }
      if (!result.title || typeof result.title !== 'string') {
        throw new Error('Missing or invalid title field');
      }
      if (!result.questions || !Array.isArray(result.questions)) {
        throw new Error('Missing or invalid questions field');
      }
      
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
   * @param {boolean} useWebSearch - Whether to enhance with web search (default: true)
   * @param {string} reasoningLevel - Reasoning level: "fast", "medium", "long" (default: "medium")
   * @returns {Promise<Object>} Research page content
   */
  static async generateResearchPage(originalTopic, clarifyingQuestions, answers, useWebSearch = true, reasoningLevel = "high") {
    try {
      console.log('=== OpenAI: Generating research page ===', { originalTopic, clarifyingQuestions, answers, useWebSearch, reasoningLevel });
  
      const qaContext = clarifyingQuestions && clarifyingQuestions.length > 0 
        ? clarifyingQuestions.map((question, index) => 
            `Q${index + 1}: ${question}\nA${index + 1}: ${answers[index] || 'No answer provided'}`
          ).join('\n\n')
        : `No specific clarifying questions were provided. Generate comprehensive research based on the topic itself.`;
  
      const prompt = `
  You are an expert research assistant. Generate a complete, professional research page based on the following information.
  
  Original Research Topic:
  "${originalTopic}"
  
  ${clarifyingQuestions && clarifyingQuestions.length > 0 ? `
  Clarifying Questions and Answers:
  ${qaContext}
  ` : `
  Research Context:
  ${qaContext}
  `}
  
  ${useWebSearch ? `
  IMPORTANT: You have access to web search capabilities. Use them to gather current, authoritative information about this topic. Search for:
  - Recent developments and trends
  - Current statistics and data
  - Expert opinions and analysis
  - Academic research and studies
  - Industry reports and insights
  
  Make sure to cite all sources properly using inline citations.
  ` : ''}
  
  CRITICAL INSTRUCTIONS:
  1. You are conducting ACTUAL RESEARCH - not giving advice on how to do research
  2. Provide SUBSTANTIVE FINDINGS, DATA, and ANALYSIS - not research methodology suggestions
  3. DO NOT tell the user how to conduct research - CONDUCT THE RESEARCH YOURSELF
  4. Generate ONLY the research content - NO preambles, introductions, or meta-commentary
  5. DO NOT start with phrases like "I'd like to help you" or "Here is your research"
  6. DO NOT include clarifying questions - those have already been answered
  7. Start directly with substantive research findings
  8. DO NOT use bold formatting (**text**) anywhere in your response
  9. Use clean, professional formatting with simple headings and bullet points only
  
  The research page must include ACTUAL RESEARCH FINDINGS in these sections:
  
  1. Refined Research Question - State the focused research question based on the clarifications
  2. Executive Summary - Provide a concise overview of your key findings (2-3 paragraphs)
  3. Current State of the Field - Present actual data, statistics, and recent developments you found
  4. Key Findings & Analysis - Provide 5-7 substantive findings with supporting evidence and data
  5. Expert Perspectives - Include actual quotes, opinions, and insights from credible sources
  6. Case Studies or Examples - Present 2-3 real-world examples with specific details
  7. Trends & Future Directions - Analyze current trends with data and predict future developments
  8. Comparative Analysis - Compare different approaches, models, or perspectives with evidence
  9. Challenges & Considerations - Discuss real challenges backed by research and data
  10. Recommendations - Provide specific, actionable recommendations based on your findings
  11. Cited Sources - List all sources used (you must cite throughout the document)
  
  REMEMBER: You are a researcher presenting FINDINGS, not a consultant suggesting how to research!
  
  Formatting requirements:
  - Return in Markdown format with clear section headings (#, ##, ###)
  - Maintain a formal, academic tone
  - DO NOT use any bold formatting (**text** or *text*)
  - Make links readable: "Link text (URL)" format instead of markdown links
  - Keep paragraphs well-spaced and concise
  - DO NOT include provider names or duplicate headers
  ${useWebSearch ? '- Include inline citations using [source] format' : ''}
  - Output ONLY the research page content, no preamble or explanation
  `;
  
      let response;
      
      if (useWebSearch) {
        console.log('=== OpenAI: Using web search with responses.create API ===');
        response = await openai.responses.create({
          model: process.env.CHATGPT_MODEL || "gpt-5",
          tools: [{ type: "web_search" }],
          input: prompt
        });
      } else {
        console.log('=== OpenAI: Using standard chat completions ===');
        response = await openai.chat.completions.create({
          model: process.env.CHATGPT_MODEL || "gpt-5",
          messages: [{ role: "user", content: prompt }],
          max_completion_tokens: 20000
        });
      }

      let researchContent, annotations, toolCalls;
      
      if (useWebSearch) {
        researchContent = response.output_text || "";
        annotations = response.output?.annotations || [];
        toolCalls = response.output?.web_search_calls || [];
        
        console.log('=== OpenAI: Generated research page preview ===', researchContent.substring(0, 200) + '...');
        console.log('=== OpenAI: Citations count ===', annotations.length);
        console.log('=== OpenAI: Web search calls count ===', toolCalls.length);
      } else {
        researchContent = (response?.choices?.[0]?.message?.content || "").trim();
        annotations = [];
        toolCalls = [];
        
        console.log('=== OpenAI: Generated research page preview ===', researchContent.substring(0, 200) + '...');
        console.log('=== OpenAI: Using model knowledge (no web search) ===');
      }
      
      // Remove any remaining preambles that might have slipped through
      researchContent = researchContent
        .replace(/^I'd like to help you.*?comprehensive research (?:for you|plan for you)\.?\s*/gis, '')
        .replace(/^I'd like to help you.*?Please answer.*?one by one.*?\.?\s*/gis, '')
        .replace(/^Here is (?:your|the) (?:comprehensive )?research.*?:?\s*/gi, '')
        .trim();
  
      return {
        success: true,
        researchPage: researchContent,
        originalTopic,
        clarifyingQuestions,
        answers,
        webSearchUsed: useWebSearch,
        citations: annotations,
        searchCalls: toolCalls,
        reasoningLevel
      };
  
    } catch (error) {
      console.error('=== OpenAI: Error generating research page ===', error);
      return {
        success: false,
        error: 'Failed to generate research page'
      };
    }
  }

  /**
   * Generate comprehensive research using web search for any topic
   * @param {string} topic - The research topic
   * @param {string} reasoningLevel - Reasoning level: "fast", "medium", "long" (default: "medium")
   * @returns {Promise<Object>} Comprehensive research with citations
   */
  static async generateWebResearch(topic, reasoningLevel = "high") {
    try {
      console.log('=== OpenAI: Generating comprehensive web research ===', { topic, reasoningLevel });
      
      const prompt = `
You are a research assistant conducting comprehensive web research on the following topic:

Research Topic: "${topic}"

Your goal is to:
1. Search for current, authoritative information
2. Analyze multiple sources and perspectives
3. Synthesize findings into a comprehensive overview
4. Provide proper citations for all sources

Search strategy:
- Start with broad searches to understand the topic landscape
- Narrow down to specific aspects as needed
- Look for recent developments, statistics, expert opinions
- Verify information across multiple sources
- Focus on credible domains (academic, government, established organizations)

Provide a detailed research summary with inline citations. Include:
- Key findings and insights
- Current trends and developments
- Different perspectives or viewpoints
- Relevant statistics or data
- Future implications or directions

IMPORTANT: DO NOT use bold formatting (**text**). Use simple headings and bullet points only.
Make sure to cite all sources properly.
`;

      const response = await openai.responses.create({
        model: process.env.CHATGPT_MODEL || "gpt-5",
        tools: [{ type: "web_search" }],
        input: prompt
      });

      const content = response.output_text || "";
      const annotations = response.output?.annotations || [];
      const toolCalls = response.output?.web_search_calls || [];
      
      console.log('=== OpenAI: Web search completed ===', { 
        contentLength: content?.length || 0, 
        citationsCount: annotations.length,
        toolCallsCount: toolCalls.length
      });

      return {
        success: true,
        researchContent: content,
        citations: annotations,
        searchCalls: toolCalls,
        topic,
        reasoningLevel
      };

    } catch (error) {
      console.error('=== OpenAI: Error performing web research ===', error);
      return {
        success: false,
        error: 'Failed to perform web research',
        researchContent: '',
        citations: []
      };
    }
  }
}