'use client';

import { useState, useRef, useCallback } from 'react';
import { Upload, Camera, Sparkles, Loader2, Image as ImageIcon, X, Star, ShoppingBag, Palette, Lightbulb, ChevronRight, Bot, Home, Layers } from 'lucide-react';

const priorityColors = {
  High: 'bg-danger-light text-danger',
  Medium: 'bg-accent-light text-accent',
  Low: 'bg-info-light text-info',
};

export default function RecommendPage() {
  const [roomImage, setRoomImage] = useState(null);
  const [roomPreview, setRoomPreview] = useState(null);
  const [furnitureImages, setFurnitureImages] = useState([]);
  const [editInstruction, setEditInstruction] = useState('Replace sofa with uploaded sofa');
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  
  const roomInputRef = useRef(null);
  const furnitureInputRef = useRef(null);

  const handleRoomUpload = (file) => {
    if (!file || !file.type.startsWith('image/')) return;
    setRoomImage(file);
    setResult(null);
    const reader = new FileReader();
    reader.onload = (e) => setRoomPreview(e.target.result);
    reader.readAsDataURL(file);
  };

  const handleFurnitureUpload = (e) => {
    const files = Array.from(e.target.files).filter(f => f.type.startsWith('image/'));
    if (files.length === 0) return;
    
    // Max 3 furniture items
    const availableSlots = 3 - furnitureImages.length;
    const filesToAdd = files.slice(0, availableSlots);
    
    filesToAdd.forEach(file => {
      const reader = new FileReader();
      reader.onload = (event) => {
        setFurnitureImages(prev => [...prev, { file, preview: event.target.result }]);
      };
      reader.readAsDataURL(file);
    });
    
    setResult(null);
  };

  const removeFurniture = (index) => {
    setFurnitureImages(prev => prev.filter((_, i) => i !== index));
  };

  const handleGenerate = async () => {
    if (!roomImage) return;
    setLoading(true);
    setError(null);

    try {
      setLoadingStep('Uploading images to AI...');
      const formData = new FormData();
      formData.append('roomImage', roomImage);
      formData.append('editInstruction', editInstruction.trim());
      furnitureImages.forEach((item, index) => {
        formData.append(`furniture_${index}`, item.file);
      });

      setLoadingStep('Analyzing room & furniture references with Llama Vision...');
      const res = await fetch('/api/recommend', { method: 'POST', body: formData });

      setLoadingStep('Editing room image with Stability AI Search-and-Replace...');
      const data = await res.json();

      if (data.success) {
        // Map backend analysis to UI expected format
        const finalItems = [];
        if (data.analysis && data.analysis.recommendations) {
          data.analysis.recommendations.forEach(rec => {
            if (rec.matchedProducts && rec.matchedProducts.length > 0) {
              const p = rec.matchedProducts[0];
              finalItems.push({
                name: p.name,
                category: p.category,
                price: p.price,
                material: p.material,
                color: p.color,
                image: p.image
              });
            }
          });
        }

        setResult({
          success: true,
          isDemo: data.isDemo || data.analysis?.isStabilityDemo,
          stagedImage: data.stagedImage,
          kimiFallback: Boolean(data.analysis?.isKimiFallback),
          kimiFailureReason: data.analysis?.kimiFailureReason || '',
          addedItems: finalItems,
          analysis: {
            roomType: data.analysis?.roomType || "Room",
            style: data.analysis?.currentStyle || "Modern",
            lighting: "Generative AI Rendered"
          }
        });
      } else {
        setError(data.error || 'Virtual staging analysis failed');
      }
    } catch (err) {
      setError('Failed to connect to AI generation service');
    } finally {
      setLoading(false);
    }
  };

  const clearAll = () => {
    setRoomImage(null);
    setRoomPreview(null);
    setFurnitureImages([]);
    setResult(null);
    setError(null);
  };

  return (
    <div className="space-y-6 animate-[fade-in_0.5s_ease-out] min-w-0">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="p-2 rounded-xl bg-gradient-to-br from-purple/20 to-accent/20">
              <Sparkles className="w-6 h-6 text-purple" />
            </div>
            <h1 className="text-2xl font-bold text-foreground">AI Virtual Staging</h1>
          </div>

          {/* Step 3: Edit Intent */}
          <div className={`glass-card p-5 transition-opacity duration-300 ${!roomPreview ? 'opacity-50 pointer-events-none' : ''}`}>
            <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-info/20 text-info flex items-center justify-center text-xs">3</span>
              What Should AI Replace?
            </h2>
            <p className="text-xs text-muted mb-3">Example: Replace sofa with uploaded green 3-seater sofa. Keep walls and windows unchanged.</p>
            <textarea
              value={editInstruction}
              onChange={(e) => setEditInstruction(e.target.value)}
              rows={3}
              className="w-full rounded-xl bg-surface border border-border px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-purple/40"
              placeholder="Replace sofa with uploaded item"
            />
          </div>
          <p className="text-sm text-muted ml-[52px]">Upload a room and your furniture items. Our Generative AI will seamlessly place the furniture into the room.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Upload Section */}
        <div className="space-y-5">
          {/* Step 1: Room Upload */}
          <div className="glass-card p-5">
            <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-accent/20 text-accent flex items-center justify-center text-xs">1</span>
              Upload Base Room Photo
            </h2>
            
            <div
              onClick={() => !roomPreview && roomInputRef.current?.click()}
              className={`relative overflow-hidden rounded-xl border-2 border-dashed transition-all duration-300 ${
                roomPreview ? 'border-border p-2' : 'border-border/50 hover:border-accent/50 p-8 cursor-pointer bg-surface/50 hover:bg-surface'
              }`}
            >
              {!roomPreview ? (
                <div className="flex flex-col items-center justify-center text-center">
                  <Camera className="w-8 h-8 text-muted mb-3" />
                  <p className="text-sm font-medium text-foreground">Click to upload room</p>
                  <p className="text-xs text-muted mt-1">Empty or partially furnished room</p>
                </div>
              ) : (
                <div className="relative">
                  <img src={roomPreview} alt="Room" className="w-full rounded-lg object-cover max-h-[250px]" />
                  <button
                    onClick={(e) => { e.stopPropagation(); setRoomPreview(null); setRoomImage(null); setResult(null); }}
                    className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/60 hover:bg-black/80 text-white backdrop-blur-sm transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}
              <input
                ref={roomInputRef}
                type="file"
                accept="image/*"
                onChange={(e) => handleRoomUpload(e.target.files[0])}
                className="hidden"
              />
            </div>
          </div>

          {/* Step 2: Furniture Upload */}
          <div className={`glass-card p-5 transition-opacity duration-300 ${!roomPreview ? 'opacity-50 pointer-events-none' : ''}`}>
            <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-purple/20 text-purple flex items-center justify-center text-xs">2</span>
              Items to Place (Optional)
            </h2>
            <p className="text-xs text-muted mb-4">Upload up to 3 furniture items to virtually stage. If left empty, AI will suggest items from the catalog.</p>
            
            <div className="flex gap-3 overflow-x-auto pb-2">
              {furnitureImages.map((item, index) => (
                <div key={index} className="relative w-24 h-24 rounded-xl border border-border flex-shrink-0 group overflow-hidden bg-surface">
                  <img src={item.preview} alt={`Furniture ${index + 1}`} className="w-full h-full object-cover" />
                  <button
                    onClick={() => removeFurniture(index)}
                    className="absolute top-1 right-1 p-1 rounded-md bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
              
              {furnitureImages.length < 3 && (
                <div 
                  onClick={() => furnitureInputRef.current?.click()}
                  className="w-24 h-24 rounded-xl border-2 border-dashed border-border/50 hover:border-purple/50 flex-shrink-0 flex flex-col items-center justify-center cursor-pointer bg-surface/30 hover:bg-surface transition-colors"
                >
                  <Upload className="w-5 h-5 text-muted mb-1" />
                  <span className="text-[10px] text-muted font-medium">Add Item</span>
                </div>
              )}
            </div>
            <input
              ref={furnitureInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleFurnitureUpload}
              className="hidden"
            />
          </div>

          {/* Generate Button */}
          {roomPreview && !result && (
            <button
              onClick={handleGenerate}
              disabled={loading}
              className="w-full py-4 bg-gradient-to-r from-purple to-accent hover:from-purple/90 hover:to-accent/90 text-white rounded-2xl text-base font-bold transition-all flex flex-col items-center justify-center gap-1 disabled:opacity-80 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Generating Virtual Staging...</span>
                  </div>
                  <span className="text-xs font-medium text-white/80 animate-pulse">{loadingStep}</span>
                </>
              ) : (
                <div className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5" />
                  <span>Generate Staged Room</span>
                </div>
              )}
            </button>
          )}

          {error && (
            <div className="glass-card p-4 border-l-4 border-l-danger">
              <p className="text-sm text-danger font-medium">{error}</p>
            </div>
          )}
        </div>

        {/* Results Panel */}
        <div className="space-y-4">
          {!result && !loading && (
            <div className="glass-card p-10 text-center flex flex-col items-center justify-center h-full min-h-[400px]">
              <div className="w-16 h-16 rounded-2xl bg-purple/10 flex items-center justify-center mb-4 relative overflow-hidden">
                <ImageIcon className="w-7 h-7 text-purple relative z-10" />
                <div className="absolute inset-0 bg-gradient-to-t from-purple/20 to-transparent translate-y-full animate-[shimmer_2s_infinite]"></div>
              </div>
              <h3 className="text-base font-semibold text-foreground mb-2">Generative Virtual Staging</h3>
              <p className="text-sm text-muted max-w-xs mx-auto mb-4">Upload a room and watch our AI instantly replace or add furniture with photorealistic lighting and shadows.</p>
              
              <div className="flex items-center gap-2 text-xs font-medium text-muted bg-surface px-4 py-2 rounded-full border border-border">
                <Bot className="w-3.5 h-3.5" /> Powered by Generative Fill
              </div>
            </div>
          )}

          {loading && (
            <div className="glass-card p-2 relative overflow-hidden h-full min-h-[400px]">
               <div className="absolute inset-0 bg-gradient-to-r from-transparent via-purple/10 to-transparent -translate-x-full animate-[shimmer_1.5s_infinite]"></div>
               <img src={roomPreview} className="w-full h-full object-cover rounded-xl opacity-30 grayscale blur-sm" alt="Processing" />
               <div className="absolute inset-0 flex items-center justify-center">
                 <div className="glass-card py-3 px-5 flex items-center gap-3">
                   <Loader2 className="w-5 h-5 text-purple animate-spin" />
                   <span className="text-sm font-semibold text-foreground">{loadingStep}</span>
                 </div>
               </div>
            </div>
          )}

          {result && !loading && (
            <div className="glass-card overflow-hidden animate-[fade-in_0.5s_ease-out]">
              <div className="relative group">
                <img src={result.stagedImage} alt="Virtually Staged Room" className="w-full min-h-[300px] object-cover" />
                
                {result.isDemo ? (
                  <div className="absolute top-4 left-4 right-4 p-3 rounded-xl bg-black/80 backdrop-blur-md border border-danger/30 flex items-start gap-3">
                    <Sparkles className="w-5 h-5 text-danger flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-bold text-white">Static Mock Image</p>
                      <p className="text-xs text-white/70 mt-1 leading-relaxed">Kimi/Stability APIs failed. This is a pre-generated fallback image to demonstrate the UI flow.</p>
                    </div>
                  </div>
                ) : result.kimiFallback ? (
                  <div className="absolute top-4 left-4 right-4 p-3 rounded-xl bg-black/80 backdrop-blur-md border border-yellow-500/30 flex items-start gap-3">
                    <Sparkles className="w-5 h-5 text-yellow-700 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-bold text-white">Kimi Analysis Fallback Used</p>
                      <p className="text-xs text-white/70 mt-1 leading-relaxed">Furniture reference image may not be fully enforced. Reason: {result.kimiFailureReason || 'unknown error'}.</p>
                    </div>
                  </div>
                ) : (
                  <div className="absolute top-4 left-4 p-2.5 rounded-xl bg-black/60 backdrop-blur-md border border-purple/30 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-purple" />
                    <span className="text-xs font-bold text-white tracking-wide">EDITED BY STABILITY AI</span>
                  </div>
                )}
                
                <div className="absolute bottom-4 left-4 right-4 flex justify-between items-end opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="flex gap-2">
                    <span className="px-3 py-1.5 rounded-lg bg-black/70 backdrop-blur-md text-white text-xs font-medium">
                      {result.analysis.roomType}
                    </span>
                    <span className="px-3 py-1.5 rounded-lg bg-black/70 backdrop-blur-md text-white text-xs font-medium">
                      {result.analysis.style}
                    </span>
                  </div>
                  <button className="px-4 py-2 rounded-lg bg-purple hover:bg-purple-hover text-white text-sm font-semibold transition-colors shadow-lg">
                    Download Image
                  </button>
                </div>
              </div>

              <div className="p-5 bg-surface border-t border-border">
                <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                  <ShoppingBag className="w-4 h-4 text-accent" />
                  Items Featured in Render
                </h3>
                
                <div className="space-y-2">
                  {result.addedItems.map((item, i) => (
                    <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-background border border-border hover:border-purple/30 transition-colors group">
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">{item.image}</span>
                        <div>
                          <p className="text-sm font-medium text-foreground">{item.name}</p>
                          <p className="text-[10px] text-muted">{item.category} · {item.material}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-foreground">₹{item.price.toLocaleString()}</p>
                        <button className="text-[10px] font-semibold text-purple opacity-0 group-hover:opacity-100 transition-opacity uppercase tracking-widest mt-0.5">
                          View details
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
