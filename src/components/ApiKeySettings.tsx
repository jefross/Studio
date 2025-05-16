import React, { useState, useEffect } from 'react';
import { useLocalStorage } from '@/hooks/use-local-storage';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Settings } from 'lucide-react';

const ApiKeySettings = () => {
  const [apiKey, setApiKey] = useLocalStorage<string>('gemini-api-key', '');
  const [tempApiKey, setTempApiKey] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    // When dialog opens, set the temporary key to the current saved key
    if (isDialogOpen) {
      setTempApiKey(apiKey || '');
    }
  }, [isDialogOpen, apiKey]);

  const saveApiKey = () => {
    setApiKey(tempApiKey);
    setIsDialogOpen(false);
    toast({
      title: "API Key Saved",
      description: "Your Gemini API key has been saved successfully.",
    });
  };

  return (
    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="icon" className="ml-2">
          <Settings className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Gemini API Settings</DialogTitle>
          <DialogDescription>
            Enter your Gemini API key to use with the application. You can get a key from 
            the <a href="https://aistudio.google.com/app/apikey" className="text-blue-500 hover:underline" target="_blank" rel="noopener noreferrer">
              Google AI Studio
            </a>.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="api-key" className="col-span-4">
              Gemini API Key
            </Label>
            <Input
              id="api-key"
              type="password"
              placeholder="Enter your API key"
              value={tempApiKey}
              onChange={(e) => setTempApiKey(e.target.value)}
              className="col-span-4"
            />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={saveApiKey} disabled={!tempApiKey.trim()}>
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ApiKeySettings; 