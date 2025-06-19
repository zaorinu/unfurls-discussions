import { graphql } from "@octokit/graphql";
import { JSDOM } from "jsdom";
import fetch from "node-fetch";

(async () => {
  const token = process.env.GH_TOKEN;
  const commentIdNumeric = parseInt(process.env.COMMENT_ID_NUMERIC);
  const originalBody = process.env.COMMENT_BODY;
  const owner = process.env.REPO_OWNER;
  const repo = process.env.REPO_NAME;
  const discussionNumber = parseInt(process.env.DISCUSSION_NUMBER);

  const graphqlWithAuth = graphql.defaults({
    headers: { authorization: `token ${token}` },
  });

  // Busca os comentários da discussion
  const query = `
    query($owner: String!, $repo: String!, $discussionNumber: Int!) {
      repository(owner: $owner, name: $repo) {
        discussion(number: $discussionNumber) {
          comments(first: 100) {
            nodes {
              id
              databaseId
              body
            }
          }
        }
      }
    }
  `;

  const res = await graphqlWithAuth(query, { owner, repo, discussionNumber });
  const comments = res.repository.discussion.comments.nodes;
  const commentNode = comments.find(c => c.databaseId === commentIdNumeric);

  if (!commentNode) {
    console.error('Comentário não encontrado com ID numérico:', commentIdNumeric);
    process.exit(1);
  }

  const commentNodeId = commentNode.id;
  let previews = '';

  // Extrair URLs (somente do corpo fora do bloco de rodapé)
  const bodyWithoutFooter = originalBody.replace(/<!-- unfurl-bot-start -->[\s\S]*?<!-- unfurl-bot-end -->/g, '').trim();
  const urls = [...bodyWithoutFooter.matchAll(/https?:\/\/[^\s)]+/g)].map(m => m[0]);

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

  let newBody = bodyWithoutFooter;

  if (previews.trim() !== '') {
    newBody += `\n\n<!-- unfurl-bot-start -->\n${previews}<!-- unfurl-bot-end -->`;
  }

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
