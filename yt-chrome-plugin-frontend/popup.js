document.addEventListener('DOMContentLoaded', async () => {
  const outputDiv = document.getElementById('output');
  const API_KEY = 'AIzaSyBU4KfiMRQPloX1dT4UrIjGtCdGB99Wxo8';
  const API_URL = 'http://localhost:5000';

  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const url = tabs[0].url;
    const youtubeRegex = /^https:\/\/(?:www\.)?youtube\.com\/watch\?v=([\w-]{11})/;
    const match = url.match(youtubeRegex);

    if (match && match[1]) {
      const videoId = match[1];
      outputDiv.innerHTML = '<div class="status">📹 Video ID: ' + videoId + '</div><div class="status">🔄 Fetching comments...</div>';

      const comments = await fetchComments(videoId);
      
      if (comments.length === 0) {
        outputDiv.innerHTML = '<div class="error">❌ No comments found</div>';
        return;
      }

      outputDiv.innerHTML = '<div class="status">✅ Fetched ' + comments.length + ' comments</div><div class="status">🤖 Analyzing sentiment...</div>';
      
      const predictions = await getSentimentPredictions(comments);

      if (predictions) {
        displayResults(predictions, comments);
      }
    } else {
      outputDiv.innerHTML = '<div class="error">❌ Please open a YouTube video</div>';
    }
  } catch (error) {
    console.error('Error:', error);
    outputDiv.innerHTML = '<div class="error">❌ Error: ' + error.message + '</div>';
  }

  async function fetchComments(videoId) {
    let comments = [];
    let pageToken = '';
    
    try {
      while (comments.length < 200) {
        const url = 'https://www.googleapis.com/youtube/v3/commentThreads?part=snippet&videoId=' + videoId + '&maxResults=100&pageToken=' + pageToken + '&key=' + API_KEY;
        const response = await fetch(url);
        const data = await response.json();

        if (data.error) {
          throw new Error(data.error.message);
        }

        if (data.items) {
          data.items.forEach(item => {
            const text = item.snippet.topLevelComment.snippet.textOriginal;
            const timestamp = item.snippet.topLevelComment.snippet.publishedAt;
            const authorId = item.snippet.topLevelComment.snippet.authorChannelId?.value || 'Unknown';
            comments.push({ text, timestamp, authorId });
          });
        }

        pageToken = data.nextPageToken;
        if (!pageToken) break;
      }
    } catch (error) {
      throw error;
    }

    return comments;
  }

  async function getSentimentPredictions(comments) {
    try {
      const response = await fetch(API_URL + '/predict_with_timestamps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comments })
      });

      if (!response.ok) {
        throw new Error('API error');
      }

      return await response.json();
    } catch (error) {
      outputDiv.innerHTML = '<div class="error">❌ Cannot connect to ' + API_URL + '<br><small>Make sure Flask server is running!</small></div>';
      return null;
    }
  }

  function drawPieChart(positive, neutral, negative) {
    const canvas = document.createElement('canvas');
    canvas.width = 300;
    canvas.height = 300;
    const ctx = canvas.getContext('2d');

    const total = positive + neutral + negative;
    const centerX = 150;
    const centerY = 150;
    const radius = 120;

    // Calculate angles
    const positiveAngle = (positive / total) * 2 * Math.PI;
    const neutralAngle = (neutral / total) * 2 * Math.PI;
    const negativeAngle = (negative / total) * 2 * Math.PI;

    let currentAngle = -Math.PI / 2; // Start from top

    // Draw Positive (Green)
    ctx.fillStyle = '#4CAF50';
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.arc(centerX, centerY, radius, currentAngle, currentAngle + positiveAngle);
    ctx.closePath();
    ctx.fill();
    currentAngle += positiveAngle;

    // Draw Neutral (Gray)
    ctx.fillStyle = '#9E9E9E';
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.arc(centerX, centerY, radius, currentAngle, currentAngle + neutralAngle);
    ctx.closePath();
    ctx.fill();
    currentAngle += neutralAngle;

    // Draw Negative (Red)
    ctx.fillStyle = '#F44336';
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.arc(centerX, centerY, radius, currentAngle, currentAngle + negativeAngle);
    ctx.closePath();
    ctx.fill();

    return canvas;
  }

  function displayResults(predictions, comments) {
    const sentimentCounts = { '1': 0, '0': 0, '-1': 0 };
    let totalScore = 0;
    let totalWords = 0;

    predictions.forEach(item => {
      sentimentCounts[item.sentiment]++;
      totalScore += parseInt(item.sentiment);
    });

    comments.forEach(comment => {
      totalWords += comment.text.split(/\s+/).length;
    });

    const avgWordCount = (totalWords / comments.length).toFixed(1);
    const avgScore = (totalScore / predictions.length).toFixed(2);
    const normalizedScore = (((parseFloat(avgScore) + 1) / 2) * 10).toFixed(1);
    const uniqueCommenters = new Set(comments.map(c => c.authorId)).size;

    // Calculate percentages
    const positivePercent = ((sentimentCounts['1'] / predictions.length) * 100).toFixed(1);
    const neutralPercent = ((sentimentCounts['0'] / predictions.length) * 100).toFixed(1);
    const negativePercent = ((sentimentCounts['-1'] / predictions.length) * 100).toFixed(1);

    let html = '<div class="section">';
    html += '<div class="section-title">📊 Sentiment Distribution</div>';
    
    // Pie Chart Container
    html += '<div class="chart-container" id="pieChartContainer"></div>';
    
    // Legend
    html += '<div class="legend">';
    html += '<div class="legend-item"><span class="legend-color" style="background: #4CAF50;"></span>Positive: ' + sentimentCounts['1'] + ' (' + positivePercent + '%)</div>';
    html += '<div class="legend-item"><span class="legend-color" style="background: #9E9E9E;"></span>Neutral: ' + sentimentCounts['0'] + ' (' + neutralPercent + '%)</div>';
    html += '<div class="legend-item"><span class="legend-color" style="background: #F44336;"></span>Negative: ' + sentimentCounts['-1'] + ' (' + negativePercent + '%)</div>';
    html += '</div></div>';

    // Metrics
    html += '<div class="section"><div class="section-title">📈 Statistics</div>';
    html += '<div class="metrics-container">';
    html += '<div class="metric"><div class="metric-title">Total Comments</div><div class="metric-value">' + comments.length + '</div></div>';
    html += '<div class="metric"><div class="metric-title">Avg Word Count</div><div class="metric-value">' + avgWordCount + '</div></div>';
    html += '<div class="metric"><div class="metric-title">Sentiment Score</div><div class="metric-value">' + normalizedScore + '/10</div></div>';
    html += '<div class="metric"><div class="metric-title">Unique Users</div><div class="metric-value">' + uniqueCommenters + '</div></div>';
    html += '</div></div>';

    // Top Comments
    html += '<div class="section"><div class="section-title">💬 Top Comments</div><ul class="comment-list">';
    
    predictions.slice(0, 10).forEach((item, i) => {
      const emoji = item.sentiment === '1' ? '😊' : item.sentiment === '-1' ? '😞' : '😐';
      const color = item.sentiment === '1' ? '#4caf50' : item.sentiment === '-1' ? '#f44336' : '#9e9e9e';
      const label = item.sentiment === '1' ? 'Positive' : item.sentiment === '-1' ? 'Negative' : 'Neutral';
      
      html += '<li class="comment-item">';
      html += '<div class="comment-text">' + (i + 1) + '. ' + item.comment + '</div>';
      html += '<span class="comment-sentiment" style="color: ' + color + '">' + emoji + ' ' + label + '</span>';
      html += '</li>';
    });

    html += '</ul></div>';
    outputDiv.innerHTML = html;

    // Draw pie chart
    const pieChart = drawPieChart(sentimentCounts['1'], sentimentCounts['0'], sentimentCounts['-1']);
    document.getElementById('pieChartContainer').appendChild(pieChart);
  }
});