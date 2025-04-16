import { pipeline, env } from '@huggingface/transformers';

// Enable WebGPU acceleration if available
env.useBrowserCache = true;
// env.useWebGpu = true;

// Track loading state of models
const modelLoadingState = {
  classificationModel: null,
  qaModel: null,
  isLoading: false,
};

// Context about what kind of information typically goes in each SOAP section
const medicalContexts = {
  "Chief complaint": {
    description: "The patient's primary reason for seeking care, expressed in their own words",
    examples: ["chest pain", "headache for 3 days", "shortness of breath"],
    soapSection: "S",
    keywords: ["presents with", "complains of", "reports", "chief complaint", "cc", "reason for visit"]
  },
  "History of present illness": {
    description: "Chronological description of the development of the patient's illness",
    examples: ["symptoms began 2 days ago", "worsens with activity", "improves with rest"],
    soapSection: "S",
    keywords: ["history", "started", "began", "onset", "duration", "course", "hpi"]
  },
  "Past medical history": {
    description: "List of patient's significant past diseases, surgeries, and health conditions",
    examples: ["diabetes diagnosed 5 years ago", "hypertension", "previous surgery"],
    soapSection: "S",
    keywords: ["pmh", "medical history", "chronic", "previous", "past", "diagnosed with", "surgery"]
  },
  "Current medications": {
    description: "Medications the patient is currently taking including dosages",
    examples: ["lisinopril 10mg daily", "metformin 500mg twice daily", "aspirin 81mg daily"],
    soapSection: "S",
    keywords: ["medications", "meds", "taking", "prescribed", "pills", "drug", "dose", "mg", "daily"]
  },
  "Allergies": {
    description: "Substances that cause allergic reactions in the patient",
    examples: ["penicillin - rash", "shellfish - anaphylaxis", "NKDA (no known drug allergies)"],
    soapSection: "S",
    keywords: ["allergic to", "allergy", "allergies", "NKDA", "sensitive to", "reaction"]
  },
  "Physical examination findings": {
    description: "Results of the clinician's physical examination of the patient",
    examples: ["lungs clear to auscultation", "abdomen soft, non-tender", "+2 edema in lower extremities"],
    soapSection: "O",
    keywords: ["exam", "examination", "physical", "found", "observed", "auscultation", "percussion", "palpation"]
  },
  "Vital signs": {
    description: "Measurable physiological parameters",
    examples: ["BP 120/80", "HR 72", "Temp 98.6F", "RR 16", "O2 sat 99%"],
    soapSection: "O",
    keywords: ["vitals", "BP", "blood pressure", "pulse", "temperature", "respirations", "heart rate", "temp", "spo2"]
  },
  "Lab results": {
    description: "Results from laboratory tests",
    examples: ["WBC 7.2", "Hgb 13.5", "Na 140", "K 4.2", "Glucose 95"],
    soapSection: "O",
    keywords: ["labs", "laboratory", "test", "results", "values", "studies", "wbc", "hgb", "cbc", "glucose"]
  },
  "Diagnosis": {
    description: "The clinician's determination of the patient's disease or condition",
    examples: ["Acute bronchitis", "Type 2 diabetes mellitus", "Major depressive disorder"],
    soapSection: "A",
    keywords: ["diagnosis", "impression", "assessment", "dx", "determined", "condition", "suspect"]
  },
  "Treatment plan": {
    description: "Therapeutic interventions prescribed for the patient",
    examples: ["Start amoxicillin 500mg TID for 10 days", "Increase metformin to 1000mg BID", "Schedule PT evaluation"],
    soapSection: "P",
    keywords: ["plan", "treatment", "prescribed", "therapy", "start", "begin", "counseled", "recommended"]
  },
  "Follow-up instructions": {
    description: "Directions for subsequent care",
    examples: ["Return in 2 weeks", "Call if symptoms worsen", "Schedule follow-up in 3 months"],
    soapSection: "P",
    keywords: ["follow-up", "return", "f/u", "check back", "appointment", "schedule", "call if"]
  }
};

// Initialize models
const initializeModels = async () => {
  if (modelLoadingState.isLoading) {
    return;
  }

  console.log("Initializing Hugging Face models...");
  modelLoadingState.isLoading = true;

  try {
    // First model: Text classification for SOAP sections
    if (!modelLoadingState.classificationModel) {
      console.log("Loading classification model...");
      // Using a smaller model suitable for WebGPU
      modelLoadingState.classificationModel = await pipeline(
        'text-classification',
        'distilbert-base-uncased'
      );
      console.log("Classification model loaded successfully");
    }

    // Second model: Question-answering for medical elements
    if (!modelLoadingState.qaModel) {
      console.log("Loading QA model...");
      // Using a smaller model suitable for WebGPU
      modelLoadingState.qaModel = await pipeline(
        'question-answering',
        'distilbert-base-uncased-distilled-squad'
      );
      console.log("QA model loaded successfully");
    }

    modelLoadingState.isLoading = false;
    return true;
  } catch (error) {
    console.error("Error loading models:", error);
    modelLoadingState.isLoading = false;
    return false;
  }
};

// Function to identify SOAP sections using text analysis and keywords
export const identifySoapSections = async (notes: string): Promise<Record<string, string>> => {
  const sections: Record<string, string> = {
    S: "",
    O: "",
    A: "",
    P: ""
  };

  // Split notes into paragraphs
  const paragraphs = notes.split(/\n\s*\n/).filter(p => p.trim().length > 0);
  
  // If only one paragraph, split by lines instead
  const chunks = paragraphs.length <= 1 
    ? notes.split(/\n/).filter(l => l.trim().length > 0)
    : paragraphs;

  try {
    // Try to load models
    await initializeModels();

    if (modelLoadingState.classificationModel) {
      console.log("Using transformer model for SOAP classification");
      
      // Process each chunk to determine which section it belongs to
      for (const chunk of chunks) {
        if (chunk.length < 10) continue; // Skip very short chunks
        
        // Prepare prompts for each SOAP section
        const prompts = [
          `Is this text describing subjective information from the patient: "${chunk.substring(0, 200)}..."?`,
          `Is this text describing objective clinical findings: "${chunk.substring(0, 200)}..."?`,
          `Is this text an assessment or diagnosis: "${chunk.substring(0, 200)}..."?`,
          `Is this text describing a treatment plan: "${chunk.substring(0, 200)}..."?`
        ];
        
        // Get classification results
        const results = await Promise.all(prompts.map(prompt => 
          modelLoadingState.classificationModel(prompt)
        ));
        
        // Find the highest confidence section
        const confidences = [
          results[0][0].score, // S confidence
          results[1][0].score, // O confidence
          results[2][0].score, // A confidence
          results[3][0].score  // P confidence
        ];
        
        const maxIndex = confidences.indexOf(Math.max(...confidences));
        const sectionKeys = ["S", "O", "A", "P"];
        const assignedSection = sectionKeys[maxIndex];
        
        // Add to appropriate section
        sections[assignedSection] += chunk + "\n\n";
      }
    } else {
      console.log("Using keyword-based SOAP classification (fallback)");
      // Fallback to keyword-based classification
      for (const chunk of chunks) {
        // Count keywords for each section
        let sCounts = 0, oCounts = 0, aCounts = 0, pCounts = 0;
        const chunkLower = chunk.toLowerCase();
        
        // Check for subjective keywords
        for (const element of Object.values(medicalContexts)) {
          if (element.soapSection === "S") {
            sCounts += element.keywords.filter(k => chunkLower.includes(k.toLowerCase())).length;
          } else if (element.soapSection === "O") {
            oCounts += element.keywords.filter(k => chunkLower.includes(k.toLowerCase())).length;
          } else if (element.soapSection === "A") {
            aCounts += element.keywords.filter(k => chunkLower.includes(k.toLowerCase())).length;
          } else if (element.soapSection === "P") {
            pCounts += element.keywords.filter(k => chunkLower.includes(k.toLowerCase())).length;
          }
        }
        
        // Assign to section with most keyword matches
        const counts = [sCounts, oCounts, aCounts, pCounts];
        const maxIndex = counts.indexOf(Math.max(...counts));
        
        if (counts[maxIndex] > 0) {
          sections["SOAP"[maxIndex]] += chunk + "\n\n";
        } else {
          // If no keywords found, assign based on position in the document
          const index = chunks.indexOf(chunk) / chunks.length;
          if (index < 0.4) sections.S += chunk + "\n\n";
          else if (index < 0.7) sections.O += chunk + "\n\n";
          else if (index < 0.85) sections.A += chunk + "\n\n";
          else sections.P += chunk + "\n\n";
        }
      }
    }
    
    return sections;
  } catch (error) {
    console.error("Error in identifySoapSections:", error);
    
    // Fallback to positional inference
    console.log("Using positional inference for SOAP sections");
    const totalChunks = chunks.length;
    
    for (let i = 0; i < totalChunks; i++) {
      if (i < totalChunks * 0.4) sections.S += chunks[i] + "\n\n";
      else if (i < totalChunks * 0.7) sections.O += chunks[i] + "\n\n";
      else if (i < totalChunks * 0.85) sections.A += chunks[i] + "\n\n";
      else sections.P += chunks[i] + "\n\n";
    }
    
    return sections;
  }
};

// Function to analyze medical text for specific elements
export const analyzeMedicalText = async (
  notes: string,
  requiredElement: string
): Promise<{
  hasContent: boolean;
  matchedText: string | null;
  soapSection?: string;
}> => {
  console.log(`Analyzing for: ${requiredElement}`);
  
  // Get the expected SOAP section and context for this element
  const context = medicalContexts[requiredElement as keyof typeof medicalContexts];
  if (!context) {
    console.error(`No context defined for element: ${requiredElement}`);
    return { hasContent: false, matchedText: null };
  }
  
  const expectedSoapSection = context.soapSection;
  const keywords = context.keywords || [];
  const examples = context.examples || [];
  
  try {
    // First identify SOAP sections
    console.log("Identifying SOAP sections...");
    const soapSections = await identifySoapSections(notes);
    
    // If we have identified SOAP sections, prioritize the appropriate section for this element
    const relevantSection = expectedSoapSection || "";
    const sectionText = relevantSection ? soapSections[relevantSection] : "";
    
    // Prioritize the relevant section if available, otherwise check the whole note
    const textToAnalyze = sectionText && sectionText.length > 0 ? sectionText : notes;
    
    // Try to use the QA model
    await initializeModels();
    
    if (modelLoadingState.qaModel) {
      console.log("Using QA model for element detection");
      
      // Create questions based on the element type
      const questions = [
        `What is the ${requiredElement.toLowerCase()}?`,
        `Does the note mention ${requiredElement.toLowerCase()}?`,
        `Where in the note does it discuss ${requiredElement.toLowerCase()}?`
      ];
      
      // Add example-based questions
      if (examples.length > 0) {
        questions.push(`Is there anything like "${examples[0]}" in the note?`);
      }
      
      // Try each question until we find an answer
      for (const question of questions) {
        try {
          const result = await modelLoadingState.qaModel({
            question,
            context: textToAnalyze.substring(0, 2000) // Limit context length
          });
          
          // Check if we got a meaningful answer (score threshold and minimum length)
          if (result.score > 0.1 && result.answer.length > 3) {
            return {
              hasContent: true,
              matchedText: result.answer,
              soapSection: expectedSoapSection
            };
          }
        } catch (e) {
          console.warn(`QA model error with question "${question}":`, e);
          // Continue with next question
        }
      }
    }
    
    // Fallback to keyword-based approach
    console.log("Using keyword-based approach for element detection");
    
    // Check for keywords
    const textLower = textToAnalyze.toLowerCase();
    for (const keyword of [...keywords, requiredElement.toLowerCase()]) {
      const index = textLower.indexOf(keyword.toLowerCase());
      if (index >= 0) {
        // Extract surrounding context
        const start = Math.max(0, index - 50);
        const end = Math.min(textToAnalyze.length, index + keyword.length + 150);
        const extractedText = textToAnalyze.substring(start, end);
        
        return {
          hasContent: true,
          matchedText: extractedText,
          soapSection: expectedSoapSection
        };
      }
    }
    
    // Check for examples (as exact phrases might not be found)
    for (const example of examples) {
      // Try to find conceptually similar content by looking for parts of the example
      const parts = example.split(' ');
      for (const part of parts) {
        if (part.length > 3) { // Only check meaningful parts
          const index = textLower.indexOf(part.toLowerCase());
          if (index >= 0) {
            // Extract surrounding context
            const start = Math.max(0, index - 50);
            const end = Math.min(textToAnalyze.length, index + part.length + 150);
            const extractedText = textToAnalyze.substring(start, end);
            
            return {
              hasContent: true,
              matchedText: extractedText,
              soapSection: expectedSoapSection
            };
          }
        }
      }
    }
    
    // Special case handling for certain elements
    if (requiredElement === "Vital signs") {
      const vitalPatterns = [
        /BP\s*[:=]?\s*\d+\s*\/\s*\d+/i,
        /temp\w*\s*[:=]?\s*\d+\.?\d*/i,
        /HR\s*[:=]?\s*\d+/i,
        /pulse\s*[:=]?\s*\d+/i,
        /RR\s*[:=]?\s*\d+/i,
        /SPO2\s*[:=]?\s*\d+/i,
        /O2 sat\w*\s*[:=]?\s*\d+/i,
      ];
      
      for (const pattern of vitalPatterns) {
        const match = textToAnalyze.match(pattern);
        if (match) {
          // Find the paragraph containing this match
          const paragraphs = textToAnalyze.split('\n');
          const matchingParagraph = paragraphs.find(p => p.match(pattern));
          
          return {
            hasContent: true,
            matchedText: matchingParagraph || match[0],
            soapSection: expectedSoapSection
          };
        }
      }
    }
    
    // No matching content found
    return {
      hasContent: false,
      matchedText: null,
      soapSection: expectedSoapSection
    };
  } catch (error) {
    console.error("Error analyzing medical text:", error);
    
    // Attempt basic keyword matching as last resort
    const textLower = notes.toLowerCase();
    for (const keyword of [...keywords, requiredElement.toLowerCase()]) {
      if (textLower.includes(keyword.toLowerCase())) {
        return {
          hasContent: true,
          matchedText: `Contains "${keyword}" (exact location not determined)`,
          soapSection: expectedSoapSection
        };
      }
    }
    
    return {
      hasContent: false,
      matchedText: null,
      soapSection: expectedSoapSection
    };
  }
};
