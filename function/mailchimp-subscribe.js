const crypto = require('crypto');
const https = require('https');

exports.handler = async (event) => {
  // Handle CORS
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  try {
    const { email, pattern } = JSON.parse(event.body);

    if (!email || !pattern) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Email and pattern required' }),
      };
    }

    // Get Mailchimp credentials from environment variables
    const apiKey = process.env.MAILCHIMP_API_KEY;
    const listId = process.env.MAILCHIMP_LIST_ID;
    const server = apiKey.split('-')[1];

    if (!apiKey || !listId) {
      console.error('Missing Mailchimp credentials in environment variables');
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Server configuration error' }),
      };
    }

    // Map pattern to tag
    const patternTags = {
      perfectionist: 'Pattern-Relentless-Perfectionist',
      giver: 'Pattern-Infinite-Giver',
      prover: 'Pattern-Constant-Prover',
      numb: 'Pattern-Numb-Achiever',
    };

    const tag = patternTags[pattern] || 'Quiz-Completed';

    // Create email hash for Mailchimp
    const emailHash = crypto
      .createHash('md5')
      .update(email.toLowerCase())
      .digest('hex');

    // Prepare subscriber data
    const subscriberData = {
      email_address: email,
      status: 'subscribed',
      tags: [tag],
      merge_fields: {
        PATTERN: pattern,
      },
    };

    // Call Mailchimp API
    const response = await callMailchimp(
      `lists/${listId}/members/${emailHash}`,
      'PUT',
      subscriberData,
      apiKey,
      server
    );

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: 'Subscriber added successfully',
        email,
        pattern,
      }),
    };
  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: error.message,
      }),
    };
  }
};

function callMailchimp(path, method, data, apiKey, server) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(data);

    const options = {
      hostname: `${server}.api.mailchimp.com`,
      port: 443,
      path: `/3.0/${path}`,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        Authorization: `Bearer ${apiKey}`,
      },
    };

    const req = https.request(options, (res) => {
      let responseData = '';

      res.on('data', (chunk) => {
        responseData += chunk;
      });

      res.on('end', () => {
        try {
          const parsed = JSON.parse(responseData);
          if (res.statusCode >= 400) {
            reject(new Error(parsed.detail || 'Mailchimp API error'));
          } else {
            resolve(parsed);
          }
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.write(postData);
    req.end();
  });
}
