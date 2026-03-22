import sharp from 'sharp';
import { NextResponse } from 'next/server';

const PRODUCTS = [
  { id: 1, name: "Royal L-Shaped Sofa", category: "Sofas", price: 45000, material: "Fabric", color: "Grey", description: "Premium L-shaped sofa with foam cushioning", image: "🛋️" },
  { id: 2, name: "Milano King Bed", category: "Beds", price: 62000, material: "Sheesham Wood", color: "Walnut", description: "King size bed with hydraulic storage", image: "🛏️" },
  { id: 3, name: "Marble Dynasty Dining Set", category: "Dining", price: 38000, material: "Marble + Metal", color: "White", description: "6-seater dining table with marble top", image: "🪑" },
  { id: 4, name: "Executive Recliner Pro", category: "Sofas", price: 72000, material: "Leather", color: "Brown", description: "Premium leather recliner with USB charging", image: "💺" },
  { id: 5, name: "SlideMax 3-Door Wardrobe", category: "Storage", price: 55000, material: "Engineered Wood", color: "White", description: "3-door sliding wardrobe with full mirror", image: "🚪" },
  { id: 6, name: "ErgoMesh Office Chair", category: "Chairs", price: 14500, material: "Mesh + Metal", color: "Black", description: "Ergonomic office chair with lumbar support", image: "🪑" },
  { id: 7, name: "Woody Wall Bookshelf", category: "Storage", price: 22000, material: "Sheesham Wood", color: "Honey", description: "Wall-mounted bookshelf, 5 tiers", image: "📚" },
  { id: 8, name: "ComfyFold Sofa Bed", category: "Sofas", price: 32000, material: "Fabric + Metal", color: "Navy Blue", description: "Convertible sofa cum bed, 3-seater", image: "🛋️" },
  { id: 9, name: "Crystal TV Unit", category: "Living Room", price: 28000, material: "Engineered Wood", color: "Walnut", description: "TV unit with LED backlight panel", image: "📺" },
  { id: 10, name: "GlowUp Dressing Table", category: "Bedroom", price: 18500, material: "MDF + Mirror", color: "White", description: "Dressing table with LED vanity mirror", image: "💄" },
  { id: 11, name: "Adventure Bunk Bed", category: "Beds", price: 42000, material: "Metal + Wood", color: "Blue", description: "Bunk bed with built-in study table", image: "🛏️" },
  { id: 12, name: "Zenith Center Table", category: "Living Room", price: 12500, material: "Glass + Metal", color: "Clear", description: "Tempered glass center table, modern design", image: "☕" },
  { id: 13, name: "Heritage 8-Seater Dining", category: "Dining", price: 85000, material: "Teak Wood", color: "Dark Brown", description: "8-seater premium teak dining set", image: "🪑" },
  { id: 14, name: "CloudNine Bean Bag XXL", category: "Living Room", price: 3800, material: "Leatherette", color: "Tan", description: "XXL bean bag with refillable beans", image: "🫘" },
  { id: 15, name: "SoleKeeper Shoe Rack", category: "Storage", price: 8500, material: "Bamboo", color: "Natural", description: "4-tier bamboo shoe organizer", image: "👟" },
  { id: 16, name: "FocusDesk Study Table", category: "Bedroom", price: 21000, material: "Engineered Wood", color: "Oak", description: "Height-adjustable desk with 3 drawers", image: "📖" },
  { id: 17, name: "Tuscan 3-Seater Sofa", category: "Sofas", price: 38000, material: "Velvet", color: "Emerald Green", description: "Premium velvet sofa, tufted design", image: "🛋️" },
  { id: 18, name: "NightOwl Bedside Table", category: "Bedroom", price: 7500, material: "Pine Wood", color: "White", description: "2-drawer bedside table, minimalist", image: "🛏️" },
  { id: 19, name: "ModuLux Kitchen Cabinet", category: "Kitchen", price: 250000, material: "Marine Plywood", color: "White Glossy", description: "Full modular U-shaped kitchen", image: "🍳" },
  { id: 20, name: "CozyNest Accent Chair", category: "Chairs", price: 16000, material: "Fabric + Wood", color: "Mustard Yellow", description: "Accent chair with wooden legs", image: "💺" },
];

const SYSTEM_PROMPT = `You are an expert interior designer and AI image-editing prompt engineer.
You will receive a base room photo and optionally a furniture reference image (both attached directly to this message — examine each carefully).
Your job is to produce structured JSON that will drive a SEARCH-AND-REPLACE image editing API.
That API takes the ORIGINAL room photo, finds a specific piece of furniture in it, and replaces it with a new one IN-PLACE (preserving all walls, floors, lighting, and perspective).
Look at BOTH images carefully before answering.

IMPORTANT: Return ONLY valid JSON, no markdown, no code fencing, no extra text. Do NOT wrap the JSON in backticks or any code block.

The JSON must follow this exact structure:
{"roomType":"Living Room | Bedroom | Dining Room | Kitchen | Office | Bathroom","currentStyle":"Modern | Traditional | Bohemian | Scandinavian | Industrial | Minimalist | Contemporary","colorPalette":["#hex1","#hex2","#hex3","#hex4"],"existingFurniture":["list of ALL furniture already visible in the room"],"searchPrompt":"A single simple noun of what to replace. No spatial words. Examples: sofa, tv, cabinet, chair, table","replacementPrompt":"Describe the NEW furniture item to place. If a furniture reference image was provided, describe IT precisely: exact color (e.g. deep teal, navy blue), material (velvet, leather, fabric), upholstery style (tufted, smooth), silhouette, number of seats, leg style. End with: photorealistic, natural lighting, seamless integration, interior design photography. Max 80 words.","recommendations":[{"category":"Sofas | Beds | Dining | Storage | Chairs | Living Room","suggestedStyle":"style","suggestedColor":"color","suggestedMaterial":"material","reason":"reason","priority":"High"}],"designTips":["tip1","tip2"],"overallAssessment":"assessment"}

CRITICAL RULES:
  - Output ONLY the raw JSON object. No text before or after it. No markdown fences.
  - 'searchPrompt' MUST be a single simple noun (e.g. 'sofa', 'tv', 'chair'). Never use spatial words.
  - 'replacementPrompt': If a furniture reference image is attached, describe THAT exact item's color, material, shape and style. Do NOT invent a generic item.
  - If the user provides an edit instruction, use it to identify the searchPrompt target noun exactly.

`;

function matchProducts(recommendations) {
  return recommendations.map(rec => {
    // Score each product based on how well it matches the recommendation
    const scored = PRODUCTS.map(product => {
      let score = 0;
      
      // Category match (highest weight)
      if (product.category.toLowerCase() === rec.category.toLowerCase()) score += 50;
      // Partial category match
      if (product.category.toLowerCase().includes(rec.category.toLowerCase()) || 
          rec.category.toLowerCase().includes(product.category.toLowerCase())) score += 30;
      
      // Color match
      const recColor = (rec.suggestedColor || '').toLowerCase();
      const prodColor = product.color.toLowerCase();
      if (prodColor.includes(recColor) || recColor.includes(prodColor)) score += 25;
      // Partial color family matching
      const colorFamilies = {
        brown: ['walnut', 'brown', 'honey', 'oak', 'tan', 'dark brown'],
        white: ['white', 'ivory', 'cream', 'clear', 'white glossy'],
        black: ['black', 'charcoal', 'dark'],
        blue: ['blue', 'navy', 'navy blue', 'teal'],
        green: ['green', 'emerald', 'sage', 'emerald green'],
        grey: ['grey', 'gray', 'silver'],
        yellow: ['yellow', 'mustard', 'gold', 'mustard yellow'],
        natural: ['natural', 'beige', 'bamboo'],
      };
      for (const [, family] of Object.entries(colorFamilies)) {
        if (family.some(c => recColor.includes(c)) && family.some(c => prodColor.includes(c))) {
          score += 15;
          break;
        }
      }
      
      // Material match
      const recMaterial = (rec.suggestedMaterial || '').toLowerCase();
      const prodMaterial = product.material.toLowerCase();
      if (prodMaterial.includes(recMaterial) || recMaterial.includes(prodMaterial)) score += 20;
      // Material family matching
      const materialFamilies = {
        wood: ['wood', 'sheesham', 'teak', 'pine', 'oak', 'bamboo', 'plywood'],
        metal: ['metal', 'steel', 'iron'],
        fabric: ['fabric', 'velvet', 'mesh', 'cotton', 'linen'],
        leather: ['leather', 'leatherette', 'pu leather'],
        engineered: ['engineered', 'mdf', 'laminate'],
      };
      for (const [, family] of Object.entries(materialFamilies)) {
        if (family.some(m => recMaterial.includes(m)) && family.some(m => prodMaterial.includes(m))) {
          score += 10;
          break;
        }
      }

      // In-stock bonus
      if (product.stock > 0) score += 5;
      // Popular bonus
      if (product.sold > 25) score += 3;

      return { ...product, matchScore: score };
    });

    // Get top matches (score > 20, sorted by score)
    const matches = scored
      .filter(p => p.matchScore > 20)
      .sort((a, b) => b.matchScore - a.matchScore)
      .slice(0, 3);

    return {
      ...rec,
      matchedProducts: matches,
    };
  });
}

const DEMO_RESPONSE = {
  roomType: "Living Room",
  dimensions: "Medium",
  currentStyle: "Modern Minimalist",
  colorPalette: ["#2C3E50", "#ECF0F1", "#BDC3C7", "#F5E6CC"],
  existingFurniture: ["Wall-mounted TV", "Basic curtains", "Floor lamp"],
  recommendations: [
    { category: "Sofas", suggestedStyle: "Contemporary", suggestedColor: "Grey", suggestedMaterial: "Fabric", reason: "A neutral grey sofa would anchor the living space and complement the minimalist aesthetic.", priority: "High" },
    { category: "Living Room", suggestedStyle: "Modern", suggestedColor: "Walnut", suggestedMaterial: "Engineered Wood", reason: "A sleek TV unit would organize the entertainment area and add warmth with walnut tones.", priority: "High" },
    { category: "Living Room", suggestedStyle: "Modern", suggestedColor: "Clear", suggestedMaterial: "Glass + Metal", reason: "A glass center table would maintain the open, airy feel while being functional.", priority: "Medium" },
    { category: "Storage", suggestedStyle: "Contemporary", suggestedColor: "Honey", suggestedMaterial: "Sheesham Wood", reason: "A bookshelf would add personality and vertical interest to the room.", priority: "Medium" },
    { category: "Chairs", suggestedStyle: "Modern", suggestedColor: "Mustard Yellow", suggestedMaterial: "Fabric + Wood", reason: "An accent chair in mustard would add a pop of color against the neutral palette.", priority: "Low" },
  ],
  designTips: [
    "Add layered lighting — combine floor lamps with warm wall sconces for depth",
    "Introduce textile elements like throw cushions and a rug for warmth",
    "Consider a large-format artwork above the sofa as a focal point"
  ],
  overallAssessment: "This is a well-proportioned modern living room with good natural light. The neutral color palette provides an excellent canvas for adding furniture pieces that bring warmth and character. Focus on creating distinct zones — seating, entertainment, and reading."
};

function getDemoResponse(reason) {
  return NextResponse.json({
    success: true,
    isDemo: true,
    demoReason: reason,
    analysis: {
      ...DEMO_RESPONSE,
      recommendations: matchProducts(DEMO_RESPONSE.recommendations),
    },
  });
}

async function callGemini(apiKey, parts, modelName) {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: modelName });

  const result = await model.generateContent(parts);

  const responseText = result.response.text();
  let cleanJson = responseText.trim();
  if (cleanJson.startsWith('```')) {
    cleanJson = cleanJson.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  }
  return JSON.parse(cleanJson);
}

async function generateStabilitySearchReplace(roomImageBuffer, roomMimeType, searchPrompt, replacementPrompt, returnBuffer = false, isStep2 = false) {
  const apiKey = process.env.STABILITY_API_KEY;
  if (!apiKey) {
    throw new Error('STABILITY_API_KEY is not configured');
  }

  const apiUrl = 'https://api.stability.ai/v2beta/stable-image/edit/search-and-replace';

  // Build multipart/form-data manually using a Blob-based FormData
  const formData = new FormData();
  
  // The room image as a file blob
  const imageBlob = new Blob([roomImageBuffer], { type: roomMimeType || 'image/jpeg' });
  const extension = (roomMimeType || 'image/jpeg').split('/')[1] || 'jpeg';
  formData.append('image', imageBlob, `room.${extension}`);
  
  // The search prompt (what to find in the image)
  formData.append('search_prompt', searchPrompt);

  // The replacement prompt (what to put in its place)
  formData.append('prompt', replacementPrompt);

  // Negative prompt: discourage common artifacts
  formData.append('negative_prompt', 'duplicate objects, two sofas, multiple items, distorted proportions, floating furniture, wrong color, different color, blurry, unrealistic, cartoon, illustration, painting, sketch');

  // grow_mask expands the bounding box so a larger replacement fits without clipping
  if (!isStep2) {
    formData.append('grow_mask', '15');
  }
  // Output format
  formData.append('output_format', 'webp');

  console.log('[Stability API] Search prompt:', searchPrompt);
  console.log('[Stability API] Replacement prompt:', replacementPrompt);

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Accept': 'image/*',
    },
    body: formData,
  });

  if (!response.ok) {
    const errBody = await response.text();
    console.error('Stability API Error:', response.status, errBody);
    throw new Error(`Stability API failed: ${response.status} — ${errBody}`);
  }

  // The API returns raw image bytes when Accept: image/*
  const imageArrayBuffer = await response.arrayBuffer();
  
  if (returnBuffer) {
    return Buffer.from(imageArrayBuffer);
  }

  const base64 = Buffer.from(imageArrayBuffer).toString('base64');
  return `data:image/webp;base64,${base64}`;
}

// editRoomWithGemini: sends BOTH room image and furniture image directly to Gemini.
// Gemini sees the actual furniture (not a text description) and generates the edited room.
async function editRoomWithGemini(geminiApiKey, roomBuffer, furnitureBuffer, furnitureMime, editInstruction) {
  const roomB64 = roomBuffer.toString('base64');
  const furnitureB64 = furnitureBuffer.toString('base64');

  const instruction = editInstruction?.trim()
    ? `You are an expert interior designer and image editor.

Task: "${editInstruction}"

Image 1 is the room to edit. Image 2 is the exact furniture item to place into the room.

Rules:
- Replace ONLY the target item in the room with the furniture from Image 2.
- The placed furniture MUST match Image 2 exactly: same color, shape, style, upholstery, and legs.
- Preserve everything else in the room exactly as-is: walls, floor, ceiling, lighting, windows, curtains, rug, table, and all other objects.
- Match the room's perspective and lighting for the placed furniture so it looks natural.
- Output only the edited room image, nothing else.`
    : `Image 1 is a room. Image 2 is a furniture item. Place the furniture from Image 2 into the room. Keep everything else unchanged.`;

  const body = {
    contents: [{ parts: [
      { text: instruction },
      { inline_data: { mime_type: 'image/jpeg', data: roomB64 } },
      { inline_data: { mime_type: furnitureMime,  data: furnitureB64 } }
    ]}],
    generationConfig: { responseModalities: ['IMAGE', 'TEXT'] }
  };

  // Verified available models (checked via ListModels API 2026-03-20)
  const GEMINI_IMAGE_MODELS = [
    'gemini-2.5-flash-image',
    'gemini-3.1-flash-image-preview',
    'gemini-3-pro-image-preview',
  ];

  for (const model of GEMINI_IMAGE_MODELS) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiApiKey}`;
    console.log(`[Gemini] Trying model: ${model}`);

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (response.status === 404) {
      console.warn(`[Gemini] Model ${model} not found, trying next...`);
      continue;
    }

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Gemini API error (${model}): ${response.status} - ${errText}`);
    }

    const data = await response.json();
    const parts = data?.candidates?.[0]?.content?.parts || [];
    const imagePart = parts.find(p => p.inlineData?.mimeType?.startsWith('image/'));

    if (!imagePart) {
      const textPart = parts.find(p => p.text);
      throw new Error(`Gemini (${model}) returned no image. Response: ${textPart?.text || JSON.stringify(data).slice(0, 300)}`);
    }

    console.log(`[Gemini] Success with model: ${model}`);
    return `data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}`;
  }

  throw new Error('All Gemini image models failed or were not found for this API key.');
}

export async function POST(request) {
  try {
    const apiKey = process.env.NVIDIA_API_KEY;

    if (!apiKey) {
      return getDemoResponse('No API key configured');
    }

    const formData = await request.formData();
    const editInstruction = formData.get('editInstruction') || '';

    // Extract base room image separately (we need its raw bytes for Stability API)
    let roomImageBuffer = null;
    let roomMimeType = 'image/jpeg';
    const kimiImages = [];
    const furnitureReferences = [];

    for (const [key, val] of formData.entries()) {
      if (key === 'roomImage' && val instanceof Blob) {
        const bytes = await val.arrayBuffer();
        
        // Resize very large room images down to max 1280x1280 to save Stability API tokens/prevent 400 errors
        const originalBuffer = Buffer.from(bytes);
        roomImageBuffer = await sharp(originalBuffer)
          .resize(1280, 1280, { fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 90 })
          .toBuffer();
          
        roomMimeType = 'image/jpeg';
        kimiImages.push(`data:${roomMimeType};base64,${roomImageBuffer.toString('base64')}`);
      } else if (key.startsWith('furniture_') && val instanceof Blob) {
        const bytes = await val.arrayBuffer();
        
        // Resize furniture references well under 1024x1024 to save Kimi payload
        const originalBuffer = Buffer.from(bytes);
        const resizedFurnitureBuffer = await sharp(originalBuffer)
          .resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 85 })
          .toBuffer();
          
        const mime = 'image/jpeg';
        const b64 = resizedFurnitureBuffer.toString('base64');
        kimiImages.push(`data:${mime};base64,${b64}`);
        furnitureReferences.push({ mime, b64 });
      }
    }

    if (!roomImageBuffer) {
      return NextResponse.json({ success: false, error: 'No room image uploaded' }, { status: 400 });
    }

    const geminiApiKey = process.env.GEMINI_API_KEY;
    const hasFurniture = furnitureReferences.length > 0;

    // ── PATH A: Furniture uploaded + Gemini key → send both images directly to Gemini ──
    // Gemini SEES the actual furniture image and edits the room. No text description needed.
    // ── PATH B: No furniture or no Gemini key → Stability AI text-guided search-and-replace ──

    let analysis = null;
    let kimiErrorDetails = null;
    let stagedImageUrl = '';

    if (hasFurniture && geminiApiKey) {
      // PATH A — Gemini direct image editing
      console.log('[Pipeline] Using Gemini direct image editing...');
      try {
        const { mime: furnitureMime, b64: furnitureB64 } = furnitureReferences[0];
        const furnitureBuffer = Buffer.from(furnitureB64, 'base64');
        stagedImageUrl = await editRoomWithGemini(geminiApiKey, roomImageBuffer, furnitureBuffer, furnitureMime, editInstruction);
        console.log('[Gemini] Image editing succeeded.');
      } catch (geminiErr) {
        console.error('[Gemini] Failed:', geminiErr.message);
        return NextResponse.json({ success: false, error: `Gemini image editing failed: ${geminiErr.message}` }, { status: 500 });
      }

      // Still run room analysis for recommendations (room image only, no furniture description needed)
      try {
        analysis = await analyzeRoomWithVision(apiKey, SYSTEM_PROMPT, editInstruction, kimiImages[0]);
      } catch (e) {
        console.warn('[Vision Analysis] skipped:', e.message);
      }

    } else {
      // PATH B — Stability AI text-guided search-and-replace
      console.log('[Pipeline] Using Stability AI search-and-replace...');

      let furnitureReferenceSummary = '';
      if (hasFurniture) {
        try {
          furnitureReferenceSummary = await summarizeFurnitureReference(apiKey, furnitureReferences[0].mime, furnitureReferences[0].b64);
          console.log('[Furniture Vision Summary]:', furnitureReferenceSummary);
        } catch (e) {
          console.warn('[Furniture Vision Summary] failed:', e.message);
        }
      }

      try {
        analysis = await analyzeRoomWithVision(apiKey, SYSTEM_PROMPT, editInstruction, kimiImages[0], furnitureReferenceSummary);
        console.log('[Vision Analysis] Result:', JSON.stringify(analysis, null, 2));
      } catch (modelError) {
        console.warn('[Vision Analysis] failed:', modelError.message);
        kimiErrorDetails = modelError.message;
      }

      if (!analysis) {
        let fallbackSearchPrompt = 'furniture';
        const replaceMatch = editInstruction.match(/replace\s+(.+?)\s+with/i);
        if (replaceMatch) fallbackSearchPrompt = replaceMatch[1].trim();
        analysis = {
          searchPrompt: fallbackSearchPrompt,
          replacementPrompt: furnitureReferenceSummary || editInstruction || 'modern stylish furniture',
          recommendations: [{ category: 'Sofas', suggestedStyle: 'Contemporary', suggestedColor: 'Blue', suggestedMaterial: 'Fabric', reason: 'Fallback', priority: 'High' }],
          roomType: 'Living Room', currentStyle: 'Modern Minimalist',
          isKimiFallback: true, kimiFailureReason: kimiErrorDetails
        };
      }

      const searchPrompt = analysis.searchPrompt || 'furniture';
      const furnitureDesc = furnitureReferenceSummary || analysis.replacementPrompt || 'modern stylish furniture';
      const replacementPrompt = `${furnitureDesc}, photorealistic, natural room lighting, seamless integration, interior design photography, single object`;
      console.log('[Stability] searchPrompt:', searchPrompt);
      console.log('[Stability] replacementPrompt:', replacementPrompt);

      try {
        stagedImageUrl = await generateStabilitySearchReplace(roomImageBuffer, roomMimeType, searchPrompt, replacementPrompt, false, false);
      } catch (stabilityErr) {
        console.error('Stability API failed:', stabilityErr);
        return NextResponse.json({ success: false, error: stabilityErr.message || 'Stability API failed' }, { status: 500 });
      }
    }

    // Ensure analysis is never null before returning
    if (!analysis) {
      analysis = {
        roomType: 'Living Room', currentStyle: 'Modern',
        recommendations: [{ category: 'Sofas', suggestedStyle: 'Contemporary', suggestedColor: 'Blue', suggestedMaterial: 'Fabric', reason: 'AI staged room', priority: 'High' }]
      };
    }
    if (!Array.isArray(analysis.recommendations) || analysis.recommendations.length === 0) {
      analysis.recommendations = [{ category: 'Sofas', suggestedStyle: 'Contemporary', suggestedColor: 'Blue', suggestedMaterial: 'Fabric', reason: 'Default', priority: 'High' }];
    }
    analysis.recommendations = matchProducts(analysis.recommendations);

    return NextResponse.json({
      success: true,
      isDemo: false,
      stagedImage: stagedImageUrl,
      analysis
    });

  } catch (error) {
    console.error('Recommendation API error:', error);

    // If it's still a rate limit that slipped through, return demo
    if (error.message?.includes('429') || error.message?.includes('quota') || error.message?.includes('fetch failed')) {
      return getDemoResponse('API quota exceeded — showing demo results. Try again later or upgrade your plan.');
    }

    return NextResponse.json(
      { success: false, error: error.message || 'Failed to analyze image' },
      { status: 500 }
    );
  }
}

