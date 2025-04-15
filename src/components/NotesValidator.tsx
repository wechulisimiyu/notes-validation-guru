import React, { useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { findSimilarContent, findMatchingText } from "@/utils/semanticAnalysis";
import { useToast } from "@/hooks/use-toast";

export const NotesValidator = () => {
  const [notes, setNotes] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<null | {
    complete: boolean;
    missingElements: string[];
    detectedElements: string[];
    detectedText: Record<string, string>;
  }>(null);
  const { toast } = useToast();

  // Updated structure with descriptions
  const requiredElementsWithDescriptions: Record<string, string> = {
    "Chief complaint": "The patient's primary reason for seeking medical care",
    "History of present illness":
      "Chronological description of the patient's symptoms",
    "Past medical history": "Previous diagnoses, hospitalizations, surgeries",
    "Current medications": "All medications the patient is currently taking",
    Allergies:
      "Known allergies to medications, foods, or environmental factors",
    "Physical examination findings":
      "Results of the practitioner's examination",
    "Vital signs": "Temperature, blood pressure, pulse, respiratory rate, etc.",
  };

  const requiredElements = Object.keys(requiredElementsWithDescriptions);

  const analyzeNotes = async () => {
    setIsAnalyzing(true);
    setAnalysis(null);

    try {
      const missingElements = [];
      const detectedElements = [];
      const detectedText: Record<string, string> = {};

      for (const element of requiredElements) {
        const { hasContent, matchedText } = await findMatchingText(notes, element);
        
        if (hasContent) {
          detectedElements.push(element);
          detectedText[element] = matchedText || "Detected (no specific text extracted)";
        } else {
          missingElements.push(element);
        }
      }

      setAnalysis({
        complete: missingElements.length === 0,
        missingElements,
        detectedElements,
        detectedText,
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
      <h1 className="text-2xl font-semibold text-gray-900 mb-6">
        Clinical Notes Validation
      </h1>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="p-6">
          <h2 className="text-lg font-medium mb-4">Practitioner Notes</h2>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Enter clinical notes here..."
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
            <h2 className="text-lg font-medium mb-4">Required Information</h2>
            <ul className="space-y-2">
              {requiredElements.map((element, index) => (
                <li key={index} className="flex text-gray-700">
                  <div className="w-2 h-2 bg-blue-600 rounded-full mr-2 mt-2 flex-shrink-0" />
                  <div>
                    <span className="font-medium">{element}</span>
                    <p className="text-sm text-gray-500">
                      {requiredElementsWithDescriptions[element]}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
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
                    Detected Information:
                  </h3>
                  <ul className="space-y-3">
                    {analysis.detectedElements.map((element, index) => (
                      <li key={index} className="text-sm">
                        <div className="flex items-start">
                          <CheckCircle2 className="w-4 h-4 text-green-600 mr-2 mt-0.5" />
                          <div>
                            <span className="font-medium text-green-700">{element}</span>
                            <p className="text-gray-700 mt-1 p-2 bg-gray-50 rounded-md text-xs border border-gray-200">
                              {analysis.detectedText[element]}
                            </p>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {!analysis.complete && (
                <div>
                  <h3 className="text-sm font-medium text-gray-700 mb-2">
                    Missing Elements:
                  </h3>
                  <ul className="space-y-1">
                    {analysis.missingElements.map((element, index) => (
                      <li key={index} className="text-sm">
                        <div className="flex items-start">
                          <AlertCircle className="w-4 h-4 text-red-600 mr-2 mt-0.5" />
                          <div>
                            <span className="font-medium text-red-700">{element}</span>
                            <p className="text-gray-500 text-xs">
                              {requiredElementsWithDescriptions[element]}
                            </p>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};