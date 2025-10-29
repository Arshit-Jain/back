import sgMail from '@sendgrid/mail'
import { GeminiService } from './gemini.js'
import PDFDocument from 'pdfkit'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { marked } from 'marked'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Configure SendGrid
sgMail.setApiKey(process.env.SENDGRID_API_KEY)

/**
 * Aggressively remove all bold formatting from text
 */
const removeBoldFormatting = (text) => {
  if (!text) return '';
  
  let cleaned = text;
  
  // Pass 1: Remove triple asterisks
  cleaned = cleaned.replace(/\*\*\*([^*]+)\*\*\*/g, '$1');
  
  // Pass 2: Remove double asterisks (multiple patterns)
  cleaned = cleaned.replace(/\*\*([^*]+)\*\*/g, '$1');
  cleaned = cleaned.replace(/\*\*([^*\n]+)\*\*/g, '$1');
  cleaned = cleaned.replace(/\*\*([^*\n]*?)\*\*/g, '$1');
  cleaned = cleaned.replace(/\*\*([^*]*?)\*\*/g, '$1');
  
  // Pass 3: Remove single asterisks
  cleaned = cleaned.replace(/\*([^*]+)\*/g, '$1');
  
  // Pass 4: Remove any remaining double asterisks
  cleaned = cleaned.replace(/\*\*/g, '');
  
  // Pass 5: Remove nested or complex patterns
  cleaned = cleaned.replace(/\*+([^*\n]+)\*+/g, '$1');
  
  // Pass 6: Remove any single asterisks left
  cleaned = cleaned.replace(/\*/g, '');
  
  // Pass 7: One more pass to be absolutely sure
  cleaned = cleaned.replace(/\*\*([^*]+)\*\*/g, '$1');
  cleaned = cleaned.replace(/\*\*/g, '');
  cleaned = cleaned.replace(/\*/g, '');
  
  return cleaned;
};

/**
 * Parse text for URLs and return array of segments with link info
 */
const parseTextWithLinks = (text) => {
  if (!text) return [];
  
  const segments = [];
  
  // Match markdown links [text](url) and plain URLs
  const markdownLinkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  
  let lastIndex = 0;
  let match;
  
  // First, find all markdown links
  const markdownMatches = [];
  while ((match = markdownLinkRegex.exec(text)) !== null) {
    markdownMatches.push({
      index: match.index,
      length: match[0].length,
      text: match[1],
      url: match[2],
      type: 'markdown'
    });
  }
  
  // Then find plain URLs that aren't part of markdown links
  const urlMatches = [];
  let tempText = text;
  markdownMatches.forEach(m => {
    tempText = tempText.substring(0, m.index) + ' '.repeat(m.length) + tempText.substring(m.index + m.length);
  });
  
  while ((match = urlRegex.exec(tempText)) !== null) {
    urlMatches.push({
      index: match.index,
      length: match[0].length,
      url: match[1],
      type: 'plain'
    });
  }
  
  // Combine and sort all matches
  const allMatches = [...markdownMatches, ...urlMatches].sort((a, b) => a.index - b.index);
  
  // Build segments
  allMatches.forEach(match => {
    // Add text before the link
    if (match.index > lastIndex) {
      segments.push({
        type: 'text',
        content: text.substring(lastIndex, match.index)
      });
    }
    
    // Add the link
    segments.push({
      type: 'link',
      text: match.type === 'markdown' ? match.text : match.url,
      url: match.url
    });
    
    lastIndex = match.index + match.length;
  });
  
  // Add remaining text
  if (lastIndex < text.length) {
    segments.push({
      type: 'text',
      content: text.substring(lastIndex)
    });
  }
  
  return segments.length > 0 ? segments : [{ type: 'text', content: text }];
};

/**
 * Write text with clickable links to PDF
 */
const writeTextWithLinks = (doc, text, options = {}) => {
  const segments = parseTextWithLinks(text);
  const defaultOptions = {
    indent: 0,
    continued: false,
    ...options
  };
  
  segments.forEach((segment, index) => {
    if (segment.type === 'link') {
      // Write clickable link in blue
      doc.fillColor('blue')
        .text(segment.text, {
          link: segment.url,
          underline: true,
          continued: index < segments.length - 1,
          indent: defaultOptions.indent
        });
      doc.fillColor('black'); // Reset color
    } else {
      // Write normal text
      doc.text(segment.content, {
        continued: index < segments.length - 1,
        indent: defaultOptions.indent
      });
    }
  });
};

/**
 * Convert Markdown content to HTML for email display
 */
const markdownToHtml = (markdownContent) => {
  if (!markdownContent) return ''
  
  // Remove bold formatting before converting
  const cleanedContent = removeBoldFormatting(markdownContent);
  
  // Configure marked options for better email rendering
  marked.setOptions({
    breaks: true,
    gfm: true,
    sanitize: false
  })
  
  return marked.parse(cleanedContent)
}

/**
 * Generate a summary of the research report
 */
const generateSummary = (researchContent) => {
  const cleanContent = removeBoldFormatting(researchContent);
  const lines = cleanContent.split('\n')
  const summary = []
  
  let currentSection = ''
  let keyPoints = []
  
  for (const line of lines) {
    const trimmedLine = line.trim()
    
    if (trimmedLine.startsWith('# ')) {
      if (currentSection && keyPoints.length > 0) {
        summary.push(`${currentSection}: ${keyPoints.slice(0, 3).join('; ')}`)
      }
      currentSection = trimmedLine.substring(2)
      keyPoints = []
    }
    else if (trimmedLine.startsWith('## ') || trimmedLine.startsWith('### ')) {
      if (trimmedLine.length > 0) {
        keyPoints.push(trimmedLine.substring(trimmedLine.indexOf(' ') + 1))
      }
    }
    else if (trimmedLine.startsWith('- ') || trimmedLine.startsWith('* ')) {
      if (trimmedLine.length > 0) {
        keyPoints.push(trimmedLine.substring(2))
      }
    }
  }
  
  if (currentSection && keyPoints.length > 0) {
    summary.push(`${currentSection}: ${keyPoints.slice(0, 3).join('; ')}`)
  }
  
  return summary.join('\n\n')
}

/**
 * Generate PDF from research content with clickable links
 */
const generatePDF = (researchContent, topic) => {
  return new Promise((resolve, reject) => {
    try {
      // Remove all bold formatting before generating PDF
      const cleanContent = removeBoldFormatting(researchContent);
      
      const doc = new PDFDocument({
        size: 'A4',
        margins: {
          top: 50,
          bottom: 50,
          left: 50,
          right: 50
        }
      })
      
      const tempDir = path.join(__dirname, '../temp')
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true })
      }
      
      const fileName = `research-report-${Date.now()}.pdf`
      const filePath = path.join(tempDir, fileName)
      
      const stream = fs.createWriteStream(filePath)
      doc.pipe(stream)
      
      doc.fontSize(24)
        .font('Helvetica-Bold')
        .text('OpenAI Deep Research Results', { align: 'center' })
      
      doc.moveDown(1)
      
      doc.fontSize(18)
        .font('Helvetica')
        .text(`Research Topic: ${topic}`, { align: 'center' })
      
      doc.moveDown(2)
      
      doc.fontSize(12)
        .font('Helvetica')
      
      const lines = cleanContent.split('\n')
      let isInList = false
      let isInCodeBlock = false
      
      for (const line of lines) {
        const trimmedLine = line.trim()
        
        if (trimmedLine === '') {
          doc.moveDown(0.5)
          isInList = false
          continue
        }
        
        if (trimmedLine.startsWith('```')) {
          isInCodeBlock = !isInCodeBlock
          if (isInCodeBlock) {
            doc.moveDown(0.3)
          }
          continue
        }
        
        if (isInCodeBlock) {
          doc.fontSize(10)
            .font('Courier')
            .text(trimmedLine, { indent: 20 })
          continue
        }
        
        if (trimmedLine.startsWith('# ')) {
          doc.fontSize(20)
            .font('Helvetica-Bold')
            .text(trimmedLine.substring(2))
            .moveDown(0.5)
        } else if (trimmedLine.startsWith('## ')) {
          doc.fontSize(16)
            .font('Helvetica-Bold')
            .text(trimmedLine.substring(3))
            .moveDown(0.3)
        } else if (trimmedLine.startsWith('### ')) {
          doc.fontSize(14)
            .font('Helvetica-Bold')
            .text(trimmedLine.substring(4))
            .moveDown(0.2)
        } else if (trimmedLine.startsWith('#### ')) {
          doc.fontSize(13)
            .font('Helvetica-Bold')
            .text(trimmedLine.substring(5))
            .moveDown(0.2)
        }
        else if (/^\d+\.\s/.test(trimmedLine)) {
          if (!isInList) {
            doc.moveDown(0.3)
            isInList = true
          }
          doc.fontSize(12)
            .font('Helvetica')
          writeTextWithLinks(doc, trimmedLine, { indent: 20 })
        }
        else if (trimmedLine.startsWith('- ') || trimmedLine.startsWith('* ')) {
          if (!isInList) {
            doc.moveDown(0.3)
            isInList = true
          }
          doc.fontSize(12)
            .font('Helvetica')
          writeTextWithLinks(doc, `• ${trimmedLine.substring(2)}`, { indent: 20 })
        }
        else if (trimmedLine === '---' || trimmedLine === '***') {
          doc.moveDown(0.5)
          doc.strokeColor('#cccccc')
          doc.lineWidth(1)
          doc.moveTo(doc.x, doc.y)
          doc.lineTo(doc.page.width - doc.page.margins.right, doc.y)
          doc.stroke()
          doc.moveDown(0.5)
        }
        else {
          doc.fontSize(12)
            .font('Helvetica')
          writeTextWithLinks(doc, trimmedLine)
          isInList = false
        }
      }
      
      doc.moveDown(2)
      doc.fontSize(10)
        .font('Helvetica')
        .text('Generated by OpenAI Deep Research System', { align: 'center' })
      doc.text(new Date().toLocaleDateString(), { align: 'center' })
      
      doc.end()
      
      stream.on('finish', () => {
        resolve({ filePath, fileName })
      })
      
      stream.on('error', (error) => {
        reject(error)
      })
      
    } catch (error) {
      reject(error)
    }
  })
}

/**
 * Generate a short paragraph summary from combined markdown
 */
const generateSummaryParagraph = (combinedMarkdown) => {
  const cleanedMarkdown = removeBoldFormatting(combinedMarkdown);
  const text = cleanedMarkdown
    .replace(/[#*_`>-]/g, '')
    .replace(/\n+/g, ' ')
    .trim()
  return text.length > 650 ? text.slice(0, 640) + '…' : text
}

/**
 * Generate a combined PDF with ChatGPT and Gemini sections with clickable links
 */
const generateCombinedPDF = (chatgptContent, geminiContent, topic) => {
  return new Promise((resolve, reject) => {
    try {
      // Remove all bold formatting from both contents
      const cleanChatGPT = removeBoldFormatting(chatgptContent);
      const cleanGemini = removeBoldFormatting(geminiContent);
      
      const doc = new PDFDocument({ size: 'A4', margins: { top: 50, bottom: 50, left: 50, right: 50 } })
      const tempDir = path.join(__dirname, '../temp')
      if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true })
      const fileName = `research-combined-${Date.now()}.pdf`
      const filePath = path.join(tempDir, fileName)

      const stream = fs.createWriteStream(filePath)
      doc.pipe(stream)

      doc.fontSize(22).font('Helvetica-Bold').text('Combined Research Results', { align: 'center' })
      doc.moveDown(0.5)
      doc.fontSize(16).font('Helvetica').text(`Topic: ${topic}`, { align: 'center' })
      doc.moveDown(1)

      const writeMarkdown = (label, content) => {
        doc.addPage()
        doc.fontSize(18).font('Helvetica-Bold').text(label, { align: 'left' })
        doc.moveDown(0.5)
        const lines = String(content || '').split('\n')
        let inList = false
        let inCodeBlock = false
        
        for (const raw of lines) {
          const line = raw.trim()
          if (!line) { doc.moveDown(0.4); inList = false; continue }
          
          if (line.startsWith('```')) {
            inCodeBlock = !inCodeBlock
            if (inCodeBlock) {
              doc.moveDown(0.3)
            }
            continue
          }
          
          if (inCodeBlock) {
            doc.fontSize(9).font('Courier').text(line, { indent: 20 })
            continue
          }
          
          if (line.startsWith('# ')) { 
            doc.fontSize(16).font('Helvetica-Bold').text(line.slice(2)).moveDown(0.3); 
            continue 
          }
          if (line.startsWith('## ')) { 
            doc.fontSize(14).font('Helvetica-Bold').text(line.slice(3)).moveDown(0.2); 
            continue 
          }
          if (line.startsWith('### ')) { 
            doc.fontSize(13).font('Helvetica-Bold').text(line.slice(4)).moveDown(0.2); 
            continue 
          }
          if (line.startsWith('#### ')) { 
            doc.fontSize(12).font('Helvetica-Bold').text(line.slice(5)).moveDown(0.2); 
            continue 
          }
          
          if (/^\d+\.\s/.test(line)) {
            if (!inList) { doc.moveDown(0.2); inList = true }
            doc.fontSize(11).font('Helvetica')
            writeTextWithLinks(doc, line, { indent: 20 })
            continue
          }
          
          if (line.startsWith('- ') || line.startsWith('* ')) {
            if (!inList) { doc.moveDown(0.2); inList = true }
            doc.fontSize(11).font('Helvetica')
            writeTextWithLinks(doc, `• ${line.slice(2)}`, { indent: 20 })
            continue
          }
          
          if (line === '---' || line === '***') {
            doc.moveDown(0.5)
            doc.strokeColor('#cccccc')
            doc.lineWidth(1)
            doc.moveTo(doc.x, doc.y)
            doc.lineTo(doc.page.width - doc.page.margins.right, doc.y)
            doc.stroke()
            doc.moveDown(0.5)
            continue
          }
          
          doc.fontSize(11).font('Helvetica')
          writeTextWithLinks(doc, line)
          inList = false
        }
      }

      writeMarkdown('ChatGPT (OpenAI) Research', cleanChatGPT)
      writeMarkdown('Gemini (Google) Research', cleanGemini)

      doc.end()
      stream.on('finish', () => resolve({ filePath, fileName }))
      stream.on('error', reject)
    } catch (e) { reject(e) }
  })
}

/**
 * Send research report via email
 */
export const sendResearchReport = async (userEmail, researchContent, topic) => {
  let filePath = null
  
  try {
    console.log('=== Email Service: Starting email generation ===', { userEmail, topic })
    
    if (!process.env.SENDGRID_API_KEY) {
      throw new Error('SendGrid API key not configured. Please set SENDGRID_API_KEY in your environment variables.')
    }
    
    if (!process.env.FROM_EMAIL) {
      throw new Error('From email not configured. Please set FROM_EMAIL in your environment variables.')
    }
    
    const summary = generateSummary(researchContent)
    console.log('=== Email Service: Summary generated ===', { summaryLength: summary.length })
    
    const pdfResult = await generatePDF(researchContent, topic)
    filePath = pdfResult.filePath
    const fileName = pdfResult.fileName
    console.log('=== Email Service: PDF generated ===', { fileName })
    
    const pdfBuffer = fs.readFileSync(filePath)
    const researchHtml = markdownToHtml(researchContent)
    
    const emailContent = {
      to: userEmail,
      from: process.env.FROM_EMAIL,
      subject: `OpenAI Deep Research Results: ${topic}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; line-height: 1.6;">
          <h2 style="color: #333; text-align: center;">OpenAI Deep Research Results</h2>
          
          <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #495057; margin-top: 0;">Research Topic</h3>
            <p style="font-size: 16px; color: #212529; margin: 0;">${topic}</p>
          </div>
          
          <div style="background-color: #e3f2fd; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #1976d2; margin-top: 0;">Executive Summary</h3>
            <div style="white-space: pre-line; line-height: 1.6; color: #424242;">
              ${summary}
            </div>
          </div>
          
          <div style="margin: 30px 0;">
            <h3 style="color: #333; margin: 20px 0 15px 0; padding-bottom: 10px; border-bottom: 2px solid #007bff;">Research Report</h3>
            <div style="background-color: #fafafa; padding: 20px; border-radius: 8px; border-left: 4px solid #007bff;">
              ${researchHtml}
            </div>
          </div>
          
          <div style="background-color: #f1f8e9; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #388e3c; margin-top: 0;">Complete Report</h3>
            <p style="color: #424242; margin: 0;">
              Please find the complete research report attached as a PDF document. 
              The PDF contains the full formatted report with proper styling and clickable links.
            </p>
          </div>
          
          <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #dee2e6;">
            <p style="color: #6c757d; font-size: 14px; margin: 0;">
              This report was generated by the OpenAI Deep Research System.<br>
              Generated on ${new Date().toLocaleDateString()}
            </p>
          </div>
        </div>
      `,
      text: `
        OpenAI Deep Research Results
        
        Research Topic: ${topic}
        
        Executive Summary:
        ${summary}
        
        Complete Report:
        Please find the complete research report attached as a PDF document.
        
        Generated by OpenAI Deep Research System
        ${new Date().toLocaleDateString()}
      `,
      attachments: [
        {
          content: pdfBuffer.toString('base64'),
          filename: fileName,
          type: 'application/pdf',
          disposition: 'attachment'
        }
      ]
    }
    
    console.log('=== Email Service: Sending email ===')
    const result = await sgMail.send(emailContent)
    console.log('=== Email Service: Email sent successfully ===', { messageId: result[0].headers['x-message-id'] })
    
    fs.unlinkSync(filePath)
    console.log('=== Email Service: Temporary file cleaned up ===')
    
    return {
      success: true,
      messageId: result[0].headers['x-message-id'],
      summary
    }
    
  } catch (error) {
    console.error('=== Email Service: Error sending email ===', error)
    
    try {
      if (filePath && fs.existsSync(filePath)) {
        fs.unlinkSync(filePath)
      }
    } catch (cleanupError) {
      console.error('Error cleaning up temporary file:', cleanupError)
    }
    
    throw new Error(`Failed to send research report: ${error.message}`)
  }
}

/**
 * Send a combined ChatGPT+Gemini report via SendGrid with brief summary in body
 */
export const sendCombinedResearchReportSendGrid = async (userEmail, chatgptContent, geminiContent, topic) => {
  let filePath = null
  try {
    console.log('=== Email Service: Starting combined email generation ===', { userEmail, topic })

    if (!process.env.SENDGRID_API_KEY) {
      throw new Error('SendGrid API key not configured. Please set SENDGRID_API_KEY.')
    }
    if (!process.env.FROM_EMAIL) {
      throw new Error('From email not configured. Please set FROM_EMAIL.')
    }

    const combinedMarkdown = `## ChatGPT (OpenAI)\n\n${chatgptContent}\n\n---\n\n## Gemini (Google)\n\n${geminiContent}`
    let summaryParagraph = ''
    
    try {
      const sum = await GeminiService.summarizeCombinedReport(combinedMarkdown)
      if (sum.success && sum.summary) {
        summaryParagraph = sum.summary
      } else {
        summaryParagraph = generateSummaryParagraph(combinedMarkdown)
      }
    } catch (e) {
      summaryParagraph = generateSummaryParagraph(combinedMarkdown)
    }

    const pdf = await generateCombinedPDF(chatgptContent, geminiContent, topic)
    filePath = pdf.filePath
    const pdfBuffer = fs.readFileSync(filePath)

    const chatgptHtml = markdownToHtml(chatgptContent)
    const geminiHtml = markdownToHtml(geminiContent)
    
    const emailContent = {
      to: userEmail,
      from: process.env.FROM_EMAIL,
      subject: `Combined Research Results: ${topic}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto; line-height: 1.6;">
          <h2 style="margin:0 0 20px; color: #333; text-align: center;">Combined Research Results</h2>
          
          <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #495057; margin-top: 0;">Research Topic</h3>
            <p style="font-size: 16px; color: #212529; margin: 0;">${topic}</p>
          </div>
          
          <div style="background-color: #e3f2fd; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #1976d2; margin-top: 0;">Executive Summary</h3>
            <div style="color: #424242; white-space: pre-wrap;">${summaryParagraph}</div>
          </div>
          
          <div style="margin: 30px 0;">
            <h3 style="color: #333; margin: 20px 0 15px 0; padding-bottom: 10px; border-bottom: 2px solid #007bff;">ChatGPT (OpenAI) Research</h3>
            <div style="background-color: #fafafa; padding: 20px; border-radius: 8px; border-left: 4px solid #007bff;">
              ${chatgptHtml}
            </div>
          </div>
          
          <div style="margin: 30px 0;">
            <h3 style="color: #333; margin: 20px 0 15px 0; padding-bottom: 10px; border-bottom: 2px solid #4285f4;">Gemini (Google) Research</h3>
            <div style="background-color: #fafafa; padding: 20px; border-radius: 8px; border-left: 4px solid #4285f4;">
              ${geminiHtml}
            </div>
          </div>
          
          <div style="background-color: #f1f8e9; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #388e3c; margin-top: 0;">Complete Report</h3>
            <p style="color: #424242; margin: 0;">
              Please find the complete research report attached as a PDF document. 
              The PDF contains the full formatted report with proper styling and clickable links for all citations and references.
            </p>
          </div>
          
          <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #dee2e6;">
            <p style="color: #6c757d; font-size: 14px; margin: 0;">
              This report was generated by the Combined Research System.<br>
              Generated on ${new Date().toLocaleDateString()}
            </p>
          </div>
        </div>
      `,
      text: `Combined Research Results\n\nResearch Topic: ${topic}\n\nExecutive Summary:\n${summaryParagraph}\n\nChatGPT (OpenAI) Research:\n${chatgptContent}\n\nGemini (Google) Research:\n${geminiContent}\n\nComplete PDF report attached with clickable links.`,
      attachments: [
        {
          content: pdfBuffer.toString('base64'),
          filename: pdf.fileName,
          type: 'application/pdf',
          disposition: 'attachment'
        }
      ]
    }

    console.log('=== Email Service: Sending combined email via SendGrid ===')
    const result = await sgMail.send(emailContent)
    console.log('=== Email Service: Combined email sent ===', { messageId: result[0].headers['x-message-id'] })

    if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath)

    return { success: true, messageId: result[0].headers['x-message-id'], summary: summaryParagraph }
  } catch (error) {
    console.error('=== Email Service: Error sending combined email ===', error)
    try { if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath) } catch {}
    throw new Error(`Failed to send combined research report: ${error.message}`)
  }
}

export default {
  sendResearchReport,
  sendCombinedResearchReportSendGrid
}