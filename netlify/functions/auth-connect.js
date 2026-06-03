exports.handler = async () => {
  const clientId   = process.env.TL_CLIENT_ID;
  const siteUrl    = process.env.URL; // Netlify sets this automatically
  const redirectUri = `${siteUrl}/.netlify/functions/auth-callback`;

  if (!clientId) {
    return { statusCode: 500, body: 'TL_CLIENT_ID is not set in Netlify environment variables.' };
  }

  const params = new URLSearchParams({
    client_id:     clientId,
    response_type: 'code',
    redirect_uri:  redirectUri,
  });

  return {
    statusCode: 302,
    headers: { Location: `https://focus.teamleader.eu/oauth2/authorize?${params}` },
    body: '',
  };
};
