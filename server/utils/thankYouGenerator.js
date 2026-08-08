/**
 * Builds a formatted thank-you letter for a completed referral.
 * Pure function so it's easy to test / restyle without touching route logic.
 */
function formatDate(d = new Date()) {
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function generateThankYouLetter({ fromName, toName, requestTitle, personalNote }) {
  const date = formatDate();
  const notePara = personalNote && personalNote.trim()
    ? `\n\n${personalNote.trim()}`
    : '';

  return [
    `${date}`,
    ``,
    `Dear ${toName},`,
    ``,
    `Thank you for referring me for ${requestTitle}. Putting your own name behind mine isn't a small thing, and I don't take it lightly. Because you took the time to make the connection, a door opened that I couldn't have opened on my own.${notePara}`,
    ``,
    `I'll make sure the effort you put in was worth it.`,
    ``,
    `With gratitude,`,
    `${fromName}`,
  ].join('\n');
}

module.exports = { generateThankYouLetter };
