import React, { useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { analyzeMedicalText } from "@/utils/semanticAnalysis";
import { useToast } from "@/hooks/use-toast";

export const NotesValidator = () => {
  const [notes, setNotes] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<null | {
    complete: boolean;
    missingElements: string[];
    detectedElements: string[];
    detectedText: Record<string, string>;
    soapSections: Record<string, string[]>;
  }>(null);
  const { toast } = useToast();

  // Updated structure with descriptions
  const requiredElementsWithDescriptions: Record<string, string> = {
    // Subjective
    "Chief complaint":
      "The patient's primary reason for seeking medical care",
    "History of present illness":
      "Chronological description of the patient's symptoms",
    "Past medical history":
      "Previous diagnoses, hospitalizations, surgeries",
    "Current medications":
      "All medications the patient is currently taking",
    "Allergies":
      "Known allergies to medications, foods, or environmental factors",

    // Objective
    "Vital signs":
      "Temperature, blood pressure, pulse, respiratory rate, etc.",
    "Physical examination findings":
      "Results of the practitioner's examination",
    "Lab results": "Relevant laboratory findings and interpretations",

    // Assessment
    "Diagnosis": "Clinical assessment and differential diagnoses",

    // Plan
    "Treatment plan": "Medications, therapies, and interventions",
    "Follow-up instructions": "Next steps and patient education",
  };

  // SOAP section mapping
  const elementToSoapSection: Record<string, string> = {
    "Chief complaint": "S",
    "History of present illness": "S",
    "Past medical history": "S",
    "Current medications": "S",
    "Allergies": "S",
    "Vital signs": "O",
    "Physical examination findings": "O",
    "Lab results": "O",
    "Diagnosis": "A",
    "Treatment plan": "P",
    "Follow-up instructions": "P",
  };

  // SOAP section labels
  const soapSectionLabels: Record<string, string> = {
    "S": "Subjective",
    "O": "Objective",
    "A": "Assessment",
    "P": "Plan"
  };

  const requiredElements = Object.keys(requiredElementsWithDescriptions);

  const analyzeNotes = async () => {
    setIsAnalyzing(true);
    setAnalysis(null);

    try {
      const missingElements: string[] = [];
      const detectedElements: string[] = [];
      const detectedText: Record<string, string> = {};
      const soapSections: Record<string, string[]> = {
        "S": [],
        "O": [],
        "A": [],
        "P": []
      };

      for (const element of requiredElements) {
        const { hasContent, matchedText, soapSection } = await analyzeMedicalText(
          notes,
          element
        );

        // Use the soapSection from the analysis or fall back to our predefined mapping
        const section = soapSection || elementToSoapSection[element] || "S";

        if (hasContent) {
          detectedElements.push(element);
          detectedText[element] =
            matchedText || "Detected (no specific text extracted)";
          
          // Add to the appropriate SOAP section
          soapSections[section].push(element);
        } else {
          missingElements.push(element);
        }
      }

      setAnalysis({
        complete: missingElements.length === 0,
        missingElements,
        detectedElements,
        detectedText,
        soapSections
      });

      if (missingElements.length === 0) {
        toast({
          title: "Analysis Complete",
          description: "Notes contain all required information!",
          variant: "default",
        });
      } else {
        toast({
          title: "Missing Information",
          description: `${missingElements.length} required elements are missing.`,
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Analysis error:", error);
      toast({
        title: "Analysis Error",
        description:
          "An error occurred while analyzing notes. Using fallback method.",
        variant: "destructive",
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <h1 className="text-2xl font-semibold text-gray-900 mb-2">
        Clinical Notes Validation
      </h1>
      <p className="text-gray-600 mb-6">
        Validates clinical notes against the SOAP format: <span className="font-medium text-blue-700">S</span>ubjective (patient's story), <span className="font-medium text-blue-700">O</span>bjective (physical findings), <span className="font-medium text-blue-700">A</span>ssessment (diagnosis), <span className="font-medium text-blue-700">P</span>lan (treatment)
      </p>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="p-6">
          <h2 className="text-lg font-medium mb-4">Practitioner Notes</h2>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Enter clinical notes here...

Suggested SOAP format:
S (Subjective): Chief complaint, history, medications, allergies
O (Objective): Vital signs, physical exam findings, lab results
A (Assessment): Diagnosis and impressions
P (Plan): Treatment plan and follow-up instructions"
            className="min-h-[300px] mb-4"
          />
          <Button
            onClick={analyzeNotes}
            className="w-full"
            disabled={isAnalyzing || !notes.trim()}
          >
            {isAnalyzing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Analyzing...
              </>
            ) : (
              "Analyze Notes"
            )}
          </Button>
        </Card>

        <div className="space-y-6">
          <Card className="p-6">
            <h2 className="text-lg font-medium mb-4">Required Information (SOAP Format)</h2>
            
            {/* Group by SOAP sections */}
            {["S", "O", "A", "P"].map(section => {
              const sectionElements = requiredElements.filter(
                element => elementToSoapSection[element] === section
              );
              
              return (
                <div key={section} className="mb-6 last:mb-0">
                  <h3 className={`text-md font-medium mb-2 px-3 py-1 rounded-lg text-white inline-flex items-center
                    ${section === "S" ? "bg-blue-600" : 
                      section === "O" ? "bg-green-600" : 
                      section === "A" ? "bg-amber-600" : 
                      "bg-purple-600"}`}>
                    <span className="mr-1 font-bold">{section}:</span> {soapSectionLabels[section]}
                  </h3>
                  <ul className="space-y-2 mt-2">
                    {sectionElements.map((element, index) => (
                      <li key={index} className="flex text-gray-700">
                        <div className={`w-2 h-2 rounded-full mr-2 mt-2 flex-shrink-0
                          ${section === "S" ? "bg-blue-500" : 
                            section === "O" ? "bg-green-500" : 
                            section === "A" ? "bg-amber-500" : 
                            "bg-purple-500"}`} />
                        <div>
                          <span className="font-medium">{element}</span>
                          <p className="text-sm text-gray-500">
                            {requiredElementsWithDescriptions[element]}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </Card>

          {analysis && (
            <Card className="p-6">
              <h2 className="text-lg font-medium mb-4">Analysis Results</h2>
              <div className="flex items-center mb-4">
                {analysis.complete ? (
                  <div className="flex items-center text-green-600">
                    <CheckCircle2 className="mr-2" />
                    <span>Notes are complete</span>
                  </div>
                ) : (
                  <div className="flex items-center text-amber-600">
                    <AlertCircle className="mr-2" />
                    <span>Missing required information</span>
                  </div>
                )}
              </div>

              {analysis.detectedElements.length > 0 && (
                <div className="mb-4">
                  <h3 className="text-sm font-medium text-gray-700 mb-2">
                    Detected Information (SOAP Format):
                  </h3>
                  
                  {/* Display detected elements grouped by SOAP section */}
                  {Object.entries(analysis.soapSections).map(([section, elements]) => {
                    if (elements.length === 0) return null;
                    
                    return (
                      <div key={section} className="mb-4 last:mb-0">
                        <h4 className={`text-sm font-medium px-2 py-1 rounded-lg text-white inline-flex items-center
                          ${section === "S" ? "bg-blue-600" : 
                            section === "O" ? "bg-green-600" : 
                            section === "A" ? "bg-amber-600" : 
                            "bg-purple-600"}`}>
                          <span className="mr-1 font-bold">{section}:</span> {soapSectionLabels[section]}
                        </h4>
                        <ul className="space-y-3 mt-2">
                          {elements.map((element, index) => (
                            <li key={index} className="text-sm">
                              <div className="flex items-start">
                                <CheckCircle2 className={`w-4 h-4 mr-2 mt-0.5
                                  ${section === "S" ? "text-blue-600" : 
                                    section === "O" ? "text-green-600" : 
                                    section === "A" ? "text-amber-600" : 
                                    "text-purple-600"}`} />
                                <div>
                                  <span className={`font-medium
                                    ${section === "S" ? "text-blue-700" : 
                                      section === "O" ? "text-green-700" : 
                                      section === "A" ? "text-amber-700" : 
                                      "text-purple-700"}`}>
                                    {element}
                                  </span>
                                  <p className="text-gray-700 mt-1 p-2 bg-gray-50 rounded-md text-xs border border-gray-200">
                                    {analysis.detectedText[element]}
                                  </p>
                                </div>
                              </div>
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              )}

              {!analysis.complete && (
                <div>
                  <h3 className="text-sm font-medium text-gray-700 mb-2">
                    Missing Elements (SOAP Format):
                  </h3>
                  
                  {/* Group missing elements by SOAP section */}
                  {["S", "O", "A", "P"].map(section => {
                    const sectionMissingElements = analysis.missingElements.filter(
                      element => elementToSoapSection[element] === section
                    );
                    
                    if (sectionMissingElements.length === 0) return null;
                    
                    return (
                      <div key={section} className="mb-3 last:mb-0">
                        <h4 className={`text-sm font-medium px-2 py-1 rounded-lg text-white inline-flex items-center
                          ${section === "S" ? "bg-blue-600" : 
                            section === "O" ? "bg-green-600" : 
                            section === "A" ? "bg-amber-600" : 
                            "bg-purple-600"}`}>
                          <span className="mr-1 font-bold">{section}:</span> {soapSectionLabels[section]}
                        </h4>
                        <ul className="space-y-1 mt-2">
                          {sectionMissingElements.map((element, index) => (
                            <li key={index} className="text-sm">
                              <div className="flex items-start">
                                <AlertCircle className={`w-4 h-4 mr-2 mt-0.5
                                  ${section === "S" ? "text-blue-500" : 
                                    section === "O" ? "text-green-500" : 
                                    section === "A" ? "text-amber-500" : 
                                    "text-purple-500"}`} />
                                <div>
                                  <span className={`font-medium
                                    ${section === "S" ? "text-blue-700" : 
                                      section === "O" ? "text-green-700" : 
                                      section === "A" ? "text-amber-700" : 
                                      "text-purple-700"}`}>
                                    {element}
                                  </span>
                                  <p className="text-gray-500 text-xs">
                                    {requiredElementsWithDescriptions[element]}
                                  </p>
                                </div>
                              </div>
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};
