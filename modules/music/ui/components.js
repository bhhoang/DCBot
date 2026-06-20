// modules/music/ui/components.js — ActionRow / Modal builders. Pure: no
// Discord state read, no side effects.
const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
  ModalBuilder, TextInputBuilder, TextInputStyle,
} = require('discord.js');

const IDS = {
  NP_PAUSE: 'music:np:pause',
  NP_RESUME: 'music:np:resume',
  NP_SKIP_1: 'music:np:skip:1',
  NP_LOOP: 'music:np:loop',
  NP_SHUFFLE: 'music:np:shuffle',
  NP_QUEUE: 'music:np:queue',
  NP_VOL_DOWN: 'music:np:vol:down',
  NP_VOL_UP: 'music:np:vol:up',
  NP_VOL_MUTE: 'music:np:vol:mute',
  NP_VOL_OPEN: 'music:np:vol:open',
  SEARCH_PAGE_PREV: 'music:search:page:prev:',
  SEARCH_PAGE_NEXT: 'music:search:page:next:',
  SEARCH_CANCEL: 'music:search:cancel:',
  SEARCH_PICK: 'music:search:pick:',
  QUEUE_PAGE_PREV: 'music:queue:page:prev:',
  QUEUE_PAGE_NEXT: 'music:queue:page:next:',
  QUEUE_CLOSE: 'music:queue:close:',
  QUEUE_REMOVE: 'music:queue:remove:',
  QUEUE_CLEAR: 'music:queue:clear:',
};

function nowPlayingRows(loopMode, volume, disabled, isPaused = false) {
  const loopLabel = loopMode === 'off' ? 'Loop' : `Loop: ${loopMode}`;
  const muteLabel = volume === 0 ? 'Unmute' : 'Mute';
  const volIcon = volume === 0 ? '🔇' : volume < 50 ? '🔉' : '🔊';

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(isPaused ? IDS.NP_RESUME : IDS.NP_PAUSE)
      .setLabel(isPaused ? 'Resume' : 'Pause')
      .setEmoji(isPaused ? '▶' : '⏸')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId(IDS.NP_SKIP_1)
      .setLabel('Skip')
      .setEmoji('⏭')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId(IDS.NP_LOOP)
      .setLabel(loopLabel)
      .setEmoji('🔁')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId(IDS.NP_SHUFFLE)
      .setLabel('Shuffle')
      .setEmoji('🔀')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId(IDS.NP_QUEUE)
      .setLabel('Queue')
      .setEmoji('📜')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled),
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(IDS.NP_VOL_DOWN)
      .setLabel('-10')
      .setEmoji('🔉')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId(IDS.NP_VOL_UP)
      .setLabel('+10')
      .setEmoji('🔊')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId(IDS.NP_VOL_MUTE)
      .setLabel(muteLabel)
      .setEmoji(volIcon)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId(IDS.NP_VOL_OPEN)
      .setLabel('Volume')
      .setEmoji('🎚')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId('music:np:stop')
      .setLabel('Stop')
      .setEmoji('⏹')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(disabled),
  );

  return [row1, row2];
}

function emptyNowPlayingRows() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('music:np:play_hint')
        .setLabel('Play something')
        .setEmoji('▶')
        .setStyle(ButtonStyle.Primary),
    ),
  ];
}

function disconnectedNowPlayingRows() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('music:np:play_hint')
        .setLabel('Reconnect via /play')
        .setEmoji('▶')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(true),
    ),
  ];
}

function searchRows(picker, pageIndex, totalPages) {
  const tracks = picker.tracks.slice(pageIndex * 5, pageIndex * 5 + 5);
  const select = new StringSelectMenuBuilder()
    .setCustomId(IDS.SEARCH_PICK + picker.userId)
    .setPlaceholder('Pick a track')
    .addOptions(
      tracks.map((t, i) => {
        const idx = pageIndex * 5 + i;
        // Discord caps select-option labels at 100 chars. We prefix with
        // "N. " (4 chars max), so cap the title at 95 to leave room.
        const label = t.title.length > 95 ? t.title.slice(0, 92) + '...' : t.title;
        // Description is also capped at 100. Build it first then truncate.
        const desc = `${t.author || 'unknown'} — ${t.duration || '?'}`;
        const description = desc.length > 100 ? desc.slice(0, 97) + '...' : desc;
        return new StringSelectMenuOptionBuilder()
          .setLabel(`${idx + 1}. ${label}`)
          .setDescription(description)
          .setValue(String(idx));
      }),
    );

  const navRow = new ActionRowBuilder();
  if (totalPages > 1) {
    if (pageIndex > 0) {
      navRow.addComponents(
        new ButtonBuilder()
          .setCustomId(IDS.SEARCH_PAGE_PREV + picker.userId)
          .setLabel('Prev')
          .setEmoji('◀')
          .setStyle(ButtonStyle.Secondary),
      );
    }
    if (pageIndex < totalPages - 1) {
      navRow.addComponents(
        new ButtonBuilder()
          .setCustomId(IDS.SEARCH_PAGE_NEXT + picker.userId)
          .setLabel('Next')
          .setEmoji('▶')
          .setStyle(ButtonStyle.Secondary),
      );
    }
  }
  navRow.addComponents(
    new ButtonBuilder()
      .setCustomId(IDS.SEARCH_CANCEL + picker.userId)
      .setLabel('Cancel')
      .setEmoji('✖')
      .setStyle(ButtonStyle.Danger),
  );

  return [
    new ActionRowBuilder().addComponents(select),
    navRow,
  ];
}

function queueRows(tracks, pageIndex, totalPages, ownerId) {
  const pageTracks = tracks.slice(pageIndex * 10, pageIndex * 10 + 10);

  const navRow = new ActionRowBuilder();
  if (totalPages > 1) {
    if (pageIndex > 0) {
      navRow.addComponents(
        new ButtonBuilder()
          .setCustomId(IDS.QUEUE_PAGE_PREV + ownerId)
          .setLabel('Prev')
          .setEmoji('◀')
          .setStyle(ButtonStyle.Secondary),
      );
    }
    if (pageIndex < totalPages - 1) {
      navRow.addComponents(
        new ButtonBuilder()
          .setCustomId(IDS.QUEUE_PAGE_NEXT + ownerId)
          .setLabel('Next')
          .setEmoji('▶')
          .setStyle(ButtonStyle.Secondary),
      );
    }
  }
  navRow.addComponents(
    new ButtonBuilder()
      .setCustomId(IDS.QUEUE_CLEAR + ownerId)
      .setLabel('Clear All')
      .setEmoji('🗑')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(IDS.QUEUE_CLOSE + ownerId)
      .setLabel('Close')
      .setEmoji('✖')
      .setStyle(ButtonStyle.Secondary),
  );

  // Discord's StringSelectMenu requires 1-25 options. If this page has no
  // tracks (e.g. the queue was emptied by another path), omit the select
  // entirely and return just the nav row — the caller is expected to handle
  // the empty-queue case via a separate text response.
  if (pageTracks.length === 0) {
    return [navRow];
  }

  const select = new StringSelectMenuBuilder()
    .setCustomId(IDS.QUEUE_REMOVE + ownerId)
    .setPlaceholder('Pick a track to remove')
    .addOptions(
      pageTracks.map((t, i) => {
        const idx = pageIndex * 10 + i;
        // Discord caps select-option labels at 100 chars. We prefix with
        // "NN. " (up to 5 chars for idx >= 100), so cap the title at 95
        // to leave room for any single- or double-digit prefix.
        const label = t.title.length > 95 ? t.title.slice(0, 92) + '...' : t.title;
        // Description is also capped at 100. Build it first then truncate.
        const desc = `@${t.requestedBy?.username || 'unknown'}`;
        const description = desc.length > 100 ? desc.slice(0, 97) + '...' : desc;
        return new StringSelectMenuOptionBuilder()
          .setLabel(`${idx + 1}. ${label}`)
          .setDescription(description)
          .setValue(String(idx));
      }),
    );

  return [
    new ActionRowBuilder().addComponents(select),
    navRow,
  ];
}

function volumeModal() {
  return new ModalBuilder()
    .setCustomId('music:vol:set:submit')
    .setTitle('Set Volume')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('music:vol:set:value')
          .setLabel('Volume (0-200)')
          .setPlaceholder('e.g. 75')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMinLength(1)
          .setMaxLength(3),
      ),
    );
}

module.exports = {
  IDS,
  nowPlayingRows, emptyNowPlayingRows, disconnectedNowPlayingRows,
  searchRows, queueRows,
  volumeModal,
};
