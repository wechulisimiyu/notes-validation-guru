
import React, { useState } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { AlertCircle, CheckCircle2 } from 'lucide-react';

export const NotesValidator = () => {
  const [notes, setNotes] = useState('');
  const [analysis, setAnalysis] = useState<null | {
    complete: boolean;
    missingElements: string[];
  }>(null);

  const requiredElements = [
    "Chief complaint",
    "History of present illness",
    "Past medical history",
    "Current medications",
    "Allergies",
    "Physical examination findings",
    "Vital signs"
  ];

  const analyzeNotes = () => {
    const missingElements = requiredElements.filter(element => 
      !notes.toLowerCase().includes(element.toLowerCase())
    );

    setAnalysis({
      complete: missingElements.length === 0,
      missingElements
    });
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
            className="w-full bg-blue-600 hover:bg-blue-700"
          >
            Analyze Notes
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
