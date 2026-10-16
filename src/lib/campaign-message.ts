export function campaignMessage(body: string, name: string, inviteUrl: string) {
  const firstName = name.trim().split(/\s+/)[0] || "friend";
  const reminder = "Don't forget to check your invitation link frequently for updates.";
  let text = body.replace(/\{name\}/g, firstName).replace(/\{invite\}/g, inviteUrl).trim();
  // Native sharing receives this complete text, without a second URL attachment.
  if (inviteUrl) {
    let seen = false;
    text = text.split(inviteUrl).reduce((result, part, index) => {
      if (!index) return part;
      const separator = seen ? "" : inviteUrl;
      seen = true;
      return result + separator + part;
    }, "").trim();
  }
  if (!text.includes(reminder)) text += "\n\n" + reminder;
  if (inviteUrl && !text.includes(inviteUrl)) text += "\n" + inviteUrl;
  return text;
}

export function campaignShareData(title: string, text: string): ShareData {
  return { title, text };
}
