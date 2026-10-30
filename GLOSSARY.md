# Hitster practice app

A private app for practising the music game Hitster: you hear a song and place it by release year. The year that counts is the one printed on the Hitster card.

## Playing

**Game mode** (spelmodus):
Playing a full game by the real Hitster rules, solo or pass-and-play on one phone.
_Avoid_: Match, battle

**Practice mode** (oefenmodus):
Guessing the year and artist of songs from a chosen edition, without a timeline or tokens.
_Avoid_: Training, quiz

**Pass-and-play**:
Game mode with 2 to 8 players taking turns on one phone.
_Avoid_: Multiplayer, party mode

**Variant**:
The difficulty of a game: Original (place the card), Pro (also name artist and title), or Expert (also name the exact year).
_Avoid_: Level, difficulty

## Cards

**Card**:
One song with its card year, as printed in a Hitster edition.
_Avoid_: Track, question

**Song**:
One recording, identified by its Spotify track. A song that is printed in several editions is one song with one card year, shown by several cards.
_Avoid_: Track, number

**Uncertain year**:
A card year taken from hitify or MusicBrainz instead of a card list or Bram's own card. It still plays.

**Year correction**:
Bram's fix of a card year from his physical card. It always wins and survives a new catalogue import.

**Playable song**:
A song with a card year that Spotify can play in the Netherlands. Only playable songs are dealt.

**Card year**:
The release year printed on a card; the only year that counts as correct.
_Avoid_: Release date, Spotify year

**Edition**:
One published Dutch Hitster box with its own set of cards.
_Avoid_: Playlist, deck, pack

**Starting card**:
The face-up card each player gets at the start of a game.

**Timeline**:
A player's cards, ordered by card year.
_Avoid_: Row, line

**Placement**:
Putting the current card at a position in a timeline; correct if the card year fits between its neighbours (equal years fit either side).

## Tokens

**Token**:
A game currency: earned by naming both artist and title, spent to skip a card, steal, or buy a card.
_Avoid_: Coin, chip

**Steal**:
Spending a token to claim a different position on another player's timeline after their placement; the right stealer wins the card. Called "Hitster!" at the table.
_Avoid_: Challenge

## Practising and progress

**Player**:
Someone logged in with Spotify. Pass-and-play opponents are not players, only names in one game.
_Avoid_: User, account

**Practice session**:
A fixed set of 15 songs in practice mode, ending with a summary.
_Avoid_: Round, quiz

**Attempt**:
One answer by a player to one song, in a practice session or a solo game.
_Avoid_: Guess, try

**Box**:
A song's Leitner level (1 to 5) for one player. A correct year (at most 1 off) moves it up, anything else sends it back to box 1.
_Avoid_: Level, bucket

**Known song**:
A song in box 5 for that player.

**Weak song**:
A song in a low box for that player; due again sooner.

**Practice filter**:
One artist and/or a range of card years (a decade is a range of ten) that narrows which songs a practice session deals. Combines with the chosen editions; the session mix still applies within it.
_Avoid_: Mode, category

**Years off** (jaren ernaast):
The average of how many years a player's guessed years were off the card year, per song, decade or artist. Only attempts with a year count, so "Ken ik niet" and placements without a typed year are left out.
_Avoid_: Error, deviation

**Ontdek**:
The page that shows the playable songs of an artist, decade or year range on a timeline, oldest first.
_Avoid_: Browse, library

**Catalogue import**:
The repeatable script that loads editions, cards and songs into the database from the snapshotted sources.
_Avoid_: Sync, seed
