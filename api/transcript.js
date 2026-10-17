// Serverless API proxy for Supadata YouTube Transcript API

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({
      success: false,
      message: `Method ${req.method} Not Allowed`
    });
  }

  const { videoUrl } = req.body;

  if (!videoUrl || typeof videoUrl !== 'string') {
    return res.status(400).json({
      success: false,
      message: 'Missing or invalid YouTube video URL.'
    });
  }

  const apiKey = process.env.SUPADATA_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      success: false,
      message: 'Server configuration error: SUPADATA_API_KEY is not configured.'
    });
  }

  try {
    const supadataUrl =
      `https://api.supadata.ai/v1/transcript?url=${encodeURIComponent(videoUrl)}&mode=auto&text=true`;

    const response = await fetch(supadataUrl, {
      method: 'GET',
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json'
      }
    });

    const data = await response.json();

    // AI transcription can return an asynchronous job.
    if (response.status === 202 && data.jobId) {
      let jobData = data;

      for (let attempt = 0; attempt < 30; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 1000));

        const jobResponse = await fetch(
          `https://api.supadata.ai/v1/transcript/${encodeURIComponent(data.jobId)}`,
          {
            method: 'GET',
            headers: {
              'x-api-key': apiKey,
              'Content-Type': 'application/json'
            }
          }
        );

        jobData = await jobResponse.json();

        if (jobData.status === 'completed') {
          break;
        }

        if (
          jobData.status === 'failed' ||
          jobData.status === 'error'
        ) {
          return res.status(500).json({
            success: false,
            message: 'Transcript generation failed. Please try again.'
          });
        }
      }

      if (jobData.status !== 'completed') {
        return res.status(504).json({
          success: false,
          message: 'Transcript is taking too long. Please try again.'
        });
      }

      // Use completed job result
      if (typeof jobData.content === 'string') {
        return res.status(200).json({
          success: true,
          transcript: jobData.content,
          lang: jobData.lang || 'en'
        });
      }

      if (Array.isArray(jobData.content)) {
        const transcriptText = jobData.content
          .map(item => item.text || '')
          .join(' ');

        return res.status(200).json({
          success: true,
          transcript: transcriptText,
          lang: jobData.lang || 'en'
        });
      }

      return res.status(500).json({
        success: false,
        message: 'Transcript content was not returned.'
      });
    }

    if (!response.ok) {
      let errorMessage =
        data.error ||
        data.message ||
        `API error: ${response.status} ${response.statusText}`;

      if (response.status === 401 || response.status === 403) {
        errorMessage = 'Invalid or unauthorized Supadata API configuration.';
      } else if (response.status === 429) {
        errorMessage =
          'Rate limit exceeded or out of credits. Please try again later.';
      } else if (
        data.error === 'no_transcript' ||
        response.status === 404
      ) {
        errorMessage =
          'No transcript available for this YouTube video.';
      }

      return res.status(response.status).json({
        success: false,
        message: errorMessage
      });
    }

    let transcriptText = '';

    if (typeof data.content === 'string') {
      transcriptText = data.content;
    } else if (Array.isArray(data.content)) {
      transcriptText = data.content
        .map(item => item.text || '')
        .join(' ');
    } else if (typeof data === 'string') {
      transcriptText = data;
    }

    if (!transcriptText || transcriptText.trim() === '') {
      return res.status(404).json({
        success: false,
        message: 'No transcript content found for this video.'
      });
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
      message:
        'Failed to communicate with the transcript service. Please try again later.'
    });
  }
}
