// modules/tts/reply.js — unify the deferred/not-deferred/legacy reply branches.
// A legacy Message has no `deferred` property (undefined) and is handled by reply().
function replyOrEdit(source, payload) {
  if (source.deferred) return source.editReply(payload);
  return source.reply(payload);
}

module.exports = { replyOrEdit };
