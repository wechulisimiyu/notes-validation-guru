
import React, { useState } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { findSimilarContent } from '@/utils/semanticAnalysis';
import { useToast } from '@/hooks/use-toast';

export const NotesValidator = () => {
  const [notes, setNotes] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<null | {
    complete: boolean;
    missingElements: string[];
    detectedElements: string[];
  }>(null);
  const { toast } = useToast();

  const requiredElements = [
    "Chief complaint",
    "History of present illness",
    "Past medical history",
    "Current medications",
    "Allergies",
    "Physical examination findings",
    "Vital signs"
  ];

  const analyzeNotes = async () => {
    setIsAnalyzing(true);
    setAnalysis(null);
    
    try {
      const missingElements = [];
      const detectedElements = [];
      
      for (const element of requiredElements) {
        const hasContent = await findSimilarContent(notes, element);
        if (hasContent) {
          detectedElements.push(element);
        } else {
          missingElements.push(element);
        }
      }

      setAnalysis({
        complete: missingElements.length === 0,
        missingElements,
        detectedElements
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
      console.error('Analysis error:', error);
      toast({
        title: "Analysis Error",
        description: "An error occurred while analyzing notes. Using fallback method.",
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
              'Analyze Notes'
            )}
          </Button>
        </Card>

        <div className="space-y-6">
          <Card className="p-6">
            <h2 className="text-lg font-medium mb-4">Required Information</h2>
            <ul className="space-y-2">
              {requiredElements.map((element, index) => (
                <li 
                  key={index}
                  className="flex items-center text-gray-700"
                >
                  <div className="w-2 h-2 bg-blue-600 rounded-full mr-2" />
                  {element}
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
                  <ul className="space-y-1">
                    {analysis.detectedElements.map((element, index) => (
                      <li 
                        key={index}
                        className="text-sm text-green-600"
                      >
                        • {element}
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
                      <li 
                        key={index}
                        className="text-sm text-red-600"
                      >
                        • {element}
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

