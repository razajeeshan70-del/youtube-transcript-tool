export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({
      success: false,
      message: 'Method Not Allowed'
    });
  }

  const { videoUrl, jobId } = req.body || {};
  const apiKey = process.env.SUPADATA_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      success: false,
      message: 'Server configuration error.'
    });
  }

  try {
    // Check an existing async job
    if (jobId) {
      const jobResponse = await fetch(
        `https://api.supadata.ai/v1/transcript/${encodeURIComponent(jobId)}`,
        {
          headers: {
            'x-api-key': apiKey
          }
        }
      );

      const jobData = await jobResponse.json();

      if (!jobResponse.ok) {
        return res.status(jobResponse.status).json({
          success: false,
          message: jobData.message || jobData.error || 'Failed to check transcript job.'
        });
      }

      if (jobData.status === 'completed') {
        let transcriptText = '';

        if (typeof jobData.content === 'string') {
          transcriptText = jobData.content;
        } else if (Array.isArray(jobData.content)) {
          transcriptText = jobData.content
            .map(item => item.text || '')
            .join(' ');
        }

        return res.status(200).json({
          success: true,
          transcript: transcriptText,
          lang: jobData.lang || 'en'
        });
      }

      if (jobData.status === 'failed') {
        return res.status(500).json({
          success: false,
          message: 'Transcript generation failed. Please try again.'
        });
      }

      return res.status(202).json({
        success: false,
        processing: true,
        jobId
      });
    }

    // Start a new transcript request
    if (!videoUrl || typeof videoUrl !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Missing or invalid YouTube video URL.'
      });
    }

    const supadataUrl =
      `https://api.supadata.ai/v1/transcript?url=${encodeURIComponent(videoUrl)}&mode=auto&text=true`;

    const response = await fetch(supadataUrl, {
      method: 'GET',
      headers: {
        'x-api-key': apiKey
      }
    });

    const data = await response.json();

    // Supadata needs asynchronous processing
    if (response.status === 202 && data.jobId) {
      return res.status(202).json({
        success: false,
        processing: true,
        jobId: data.jobId
      });
    }

    if (!response.ok) {
      return res.status(response.status).json({
        success: false,
        message:
          data.error ||
          data.message ||
          `API error: ${response.status}`
      });
    }

    let transcriptText = '';

    if (typeof data.content === 'string') {
      transcriptText = data.content;
    } else if (Array.isArray(data.content)) {
      transcriptText = data.content
        .map(item => item.text || '')
        .join(' ');
    }

    if (!transcriptText.trim()) {
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
      message: 'Failed to communicate with the transcript service.'
    });
  }
}
