// Serverless API proxy for Supadata YouTube Transcript API (e.g. Vercel Serverless Function or Node.js/Express)
// Endpoint route: /api/transcript (or /api/transcript.js depending on platform)

export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ success: false, message: `Method ${req.method} Not Allowed` });
  }

  const { videoUrl } = req.body;

  if (!videoUrl || typeof videoUrl !== 'string') {
    return res.status(400).json({ success: false, message: 'Missing or invalid YouTube video URL.' });
  }

  const apiKey = process.env.SUPADATA_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ 
      success: false, 
      message: 'Server configuration error: SUPADATA_API_KEY environment variable is not configured.' 
    });
  }

  try {
    // Call Supadata official endpoint: GET https://api.supadata.ai/v1/transcript?url=...
    const supadataUrl = `https://api.supadata.ai/v1/transcript?url=${encodeURIComponent(videoUrl)}`;
    
    const response = await fetch(supadataUrl, {
      method: 'GET',
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json'
      }
    });

    const data = await response.json();

    if (!response.ok) {
      // Handle Supadata specific error codes gracefully
      let errorMessage = data.error || data.message || `API error: ${response.status} ${response.statusText}`;
      if (response.status === 401 || response.status === 403) {
        errorMessage = 'Invalid or unauthorized Supadata API key configuration.';
      } else if (response.status === 429) {
        errorMessage = 'Rate limit exceeded or out of credits. Please try again later.';
      } else if (data.error === 'no_transcript' || response.status === 404) {
        errorMessage = 'No transcript available for this YouTube video (captions may be disabled or video is private).';
      }
      return res.status(response.status).json({ success: false, message: errorMessage });
    }

    // Supadata returns transcript content either as plain text if text=true, or as an array of chunks / object
    // Format the transcript text cleanly for the frontend output
    let transcriptText = '';

    if (typeof data.content === 'string') {
      transcriptText = data.content;
    } else if (Array.isArray(data.content)) {
      // Format timestamped segments into clean text paragraphs/lines
      transcriptText = data.content
        .map(item => item.text)
        .join(' ');
    } else if (typeof data === 'string') {
      transcriptText = data;
    } else {
      transcriptText = JSON.stringify(data, null, 2);
    }

    if (!transcriptText || transcriptText.trim() === '') {
      return res.status(404).json({ success: false, message: 'No transcript content found for this video.' });
    }

    return res.status(200).json({ 
      success: true, 
      transcript: transcriptText,
      lang: data.lang || 'en'
    });

  } catch (error) {
    console.error('Transcript proxy error:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Failed to communicate with the transcript service. Please try again later.' 
    });
  }
}
