const { graphql } = require('@octokit/graphql');
const { JSDOM } = require('jsdom');
const fetch = require('node-fetch');

(async () => {
  const token = process.env.GH_TOKEN;
  const commentIdNumeric = parseInt(process.env.COMMENT_ID_NUMERIC);
  const originalBody = process.env.COMMENT_BODY;
  const owner = process.env.REPO_OWNER;
  const repo = process.env.REPO_NAME;

  const graphqlWithAuth = graphql.defaults({
    headers: {
      authorization: `token ${token}`,
    },
  });

  const query = `
    query($owner: String!, $repo: String!) {
      repository(owner: $owner, name: $repo) {
        discussionComments(first: 100) {
          nodes {
            id
            databaseId
            body
          }
        }
      }
    }
  `;

  const res = await graphqlWithAuth(query, { owner, repo });
  const comments = res.repository.discussionComments.nodes;
  const commentNode = comments.find(c => c.databaseId === commentIdNumeric);

  if (!commentNode) {
    console.error('Comentário não encontrado com ID numérico:', commentIdNumeric);
    process.exit(1);
  }

  const commentNodeId = commentNode.id;
  let previews = '';

  const urls = [...originalBody.matchAll(/https?:\/\/[^\s)]+/g)].map(m => m[0]);

  for (const url of urls) {
    try {
      const resp = await fetch(url);
      const text = await resp.text();
      const dom = new JSDOM(text);
      const metaOgTitle = dom.window.document.querySelector('meta[property="og:title"]');
      const title = (metaOgTitle && metaOgTitle.getAttribute('content')) || dom.window.document.title || url;
      previews += `> **${title}**\n> ${url}\n\n`;
    } catch (err) {
      console.error(`Erro ao buscar ${url}:`, err);
    }
  }

  const cleanBody = originalBody.replace(/^>.*(\n|$)/gm, '').trim();
  const newBody = `${cleanBody}\n\n${previews}`;

  const mutation = `
    mutation($commentId: ID!, $body: String!) {
      updateDiscussionComment(input: {commentId: $commentId, body: $body}) {
        comment {
          id
          body
        }
      }
    }
  `;

  const updateRes = await graphqlWithAuth(mutation, { commentId: commentNodeId, body: newBody });
  console.log('Comentário atualizado com sucesso:', updateRes.updateDiscussionComment.comment.id);
})().catch(err => {
  console.error(err);
  process.exit(1);
});
