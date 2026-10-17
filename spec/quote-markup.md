# Quote Markup

*Version 0.1 (draft), 2026-10-17. Text licensed CC BY 4.0; any reference parser MIT.*

Quote Markup is a profile of two existing standards, [microformats2 `h-cite`](https://microformats.org/wiki/h-cite) and [schema.org `Quotation`](https://schema.org/Quotation). It says which properties a quotation uses, how to separate the **character** a line is attributed to from its **author**, which words to use for the kind of source, and how to offer a "save this quote" link. A page can use either vocabulary or both. Nothing here replaces them; it narrows them so that a reader can rely on what it finds.

The format is not tied to any one app. Quips is its first reader.

## 1. Why a profile

A quotation has more parts than `h-cite` names. The one that matters most is that the character a line is attributed to is often not who **wrote** it: Christopher Robin says it, Carter Crocker and Karl Geurs wrote it. schema.org already models this with `spokenByCharacter` on `Quotation`. `h-cite` has only `author`, so Quote Markup keeps `author` for the writer and adds a microformats property that mirrors `spokenByCharacter`.

When a real person says their own words, as in a speech or an interview, there is no character: that person is the `author` (schema.org's own example credits Franklin Delano Roosevelt through `creator`). Use the character property only for a character, or an organization, to whom the work attributes the line.

## 2. Properties

| Meaning | microformats2 | schema.org | Required |
|---|---|---|---|
| The quoted words | `p-content` | `text` | Yes |
| Who wrote or said it, as credited | `p-author` (repeatable) | `creator` | No |
| The character (or organization) the work attributes the quote to, when not the author: fiction, film | `p-x-spoken-by-character` | `spokenByCharacter` | No |
| Title of the book, film, talk or page it comes from | `p-name` | `isPartOf.name` | No |
| Kind of source | `p-x-source-type` | `isPartOf.@type` (mapped, §4) | No |
| When it was said or published | `dt-published` | `isPartOf.datePublished` or `datePublished` | No |
| Where this quote was found | `u-url` | `url` | No |

Rules:

- `p-content` holds the quotation only, without surrounding quotation marks or the attribution.
- `p-author` may repeat; readers join the names with a comma.
- `p-x-spoken-by-character` is the character as the work credits them. It mirrors `spokenByCharacter`, whose value is a Person or Organization. Leave it out when the author is the one speaking, including real people in speeches and interviews.
- `dt-published` takes any ISO 8601 date **or a partial one**: `1997`, `1997-11`, `1997-11-04`. A reader must keep the precision it is given and must not invent a month or day.
- The `p-x-` names are placeholders pending the microformats process (§7).

## 3. HTML example

```html
<figure class="h-cite">
  <blockquote class="p-content">
    You are braver than you believe, stronger than you seem, and smarter than you think.
  </blockquote>
  <figcaption>
    — <span class="p-x-spoken-by-character">Christopher Robin</span>,
    <cite class="p-name">Pooh's Grand Adventure: The Search for Christopher Robin</cite>
    (<time class="dt-published" datetime="1997">1997</time>),
    written by <span class="p-author h-card">Carter Crocker</span>
    and <span class="p-author h-card">Karl Geurs</span>
    <data class="p-x-source-type" value="movie"></data>
  </figcaption>
</figure>
```

The same quote in JSON-LD:

```json
{
  "@context": "https://schema.org",
  "@type": "Quotation",
  "text": "You are braver than you believe, stronger than you seem, and smarter than you think.",
  "spokenByCharacter": { "@type": "Person", "name": "Christopher Robin" },
  "creator": [
    { "@type": "Person", "name": "Carter Crocker" },
    { "@type": "Person", "name": "Karl Geurs" }
  ],
  "isPartOf": {
    "@type": "Movie",
    "name": "Pooh's Grand Adventure: The Search for Christopher Robin",
    "datePublished": "1997"
  }
}
```

## 4. Source types

`p-x-source-type` takes one of these values (the `value` attribute of a `<data>` element, or its text). Unknown values are ignored, never guessed at.

`book`, `article`, `newspaper`, `magazine`, `comic`, `movie`, `television`, `documentary`, `podcast`, `radio`, `song`, `speech`, `lecture`, `interview`, `website`, `socialMedia`, `video`, `game`, `letter`, `poem`, `play`, `inPerson`.

In JSON-LD the type comes from the `@type` of `isPartOf`:

| schema.org type | Value |
|---|---|
| `Movie` | `movie` |
| `Book` | `book` |
| `TVSeries`, `TVEpisode` | `television` |
| `PodcastSeries`, `PodcastEpisode` | `podcast` |
| `MusicRecording` | `song` |
| `Article`, `NewsArticle` | `article` |
| `Speech` | `speech` |
| `VideoObject` | `video` |
| `VideoGame` | `game` |
| `Play` | `play` |
| `Poem` | `poem` |
| `Comic` | `comic` |
| `Periodical` | `magazine` |

Anything else (including a plain `CreativeWork`) carries no source type.

## 5. The save link

A page can offer a button that opens the quote for review in a reader that supports it. Two forms:

**A quote the reader already knows**, by identifier:

```
https://quipsapp.com/save/q/<id>
```

**Any other quote**, with the fields in the query string:

```
https://quipsapp.com/save?text=…&author=…&work=…&type=movie&date=1997&url=…
```

| Parameter | Meaning |
|---|---|
| `text` (required) | The quoted words. |
| `author` | Who wrote or said it, as credited. |
| `character` | The character the work attributes the quote to, when not the author. |
| `work` | Title of the source. |
| `type` | A source-type value from §4. |
| `date` | Any partial or full date, or a form such as `c. 1900`. |
| `url` | Where the quote was found. |
| `context` | One short paragraph of background. |
| `tags` | Comma-separated, a handful at most. |

Parameters must be percent-encoded. A reader opens the quote for the person to review; **it never saves without the person confirming.**

Markup for the button, so a reader can find it on the page:

```html
<a class="u-x-save" href="https://quipsapp.com/save/q/qu-002-crocker">Save to Quips</a>
```

## 6. Trust

Everything a page says about a quote is **the page's claim**. A conforming reader:

- shows third-party fields as the publisher's, never as its own research;
- never displays a verification, accuracy or "checked" badge because a link or page says so. A `verification` parameter is ignored. A publisher's own standing, if carried at all, belongs in the notes as text ("Marked verified by example.com");
- caps the length of every field, treats all of it as untrusted text, and escapes it wherever it is displayed;
- when reading a page the person is looking at, requires the quote to match what they selected, if they selected anything, so a page cannot substitute a different attribution than the words in front of the person;
- may refuse a quote with no `text`.

## 7. Status and open points

- **Names.** `p-x-spoken-by-character` (named after schema.org's `spokenByCharacter`), `p-x-source-type` and `u-x-save` use the microformats experimental form (`p-x-<name>`, per [microformats2-prefixes](https://microformats.org/wiki/microformats2-prefixes)). Prior-art check, 2026-10-17: the microformats wiki has no property for a quotation's speaker, a character, or the kind of source, and the h-cite page (a draft specification) names none; `p-content` is its stated slot for "the content itself". The only nearby proposal is `p-read-of` on h-entry, which is about a read post, not a quote. schema.org covers the character with `spokenByCharacter` (the property's definition is a character "within the containing CreativeWork") and treats `Quotation` as a newer type still collecting feedback. Next steps: publish and consume these properties on real sites (the Quote Unquote archive is the first), then add them to the [experimental properties](https://microformats.org/wiki/microformats2-experimental-properties) registry with those URLs as evidence. The wiki's process asks for documented real-world use before anything is proposed.
- **Other h-cite properties.** `p-publication`, `u-uid` and `dt-accessed` exist on h-cite and are not part of this profile. Readers may ignore them; a later version may adopt `dt-accessed` for "found on" dates.
- **Versioning.** The version is stated at the top. Changes within a major version are additive only.
- **Validator.** A page at `/spec/quote-markup/validate` that takes a URL (or pasted HTML), parses it with the reference parser and shows what a reader would import. Not built.
- **Reference parser.** The Quips share extension script (`ShareExtension/QuoteMarkup.js`) reads both vocabularies and is the starting point for a standalone MIT-licensed parser.

## 8. Readers and publishers

- **Quips** reads the markup from Safari's share sheet and opens `https://quipsapp.com/save…` links in the app.
- **Quote Unquote** (the newsletter) puts the save link under each issue's featured quote, and marks up the quote on every archive page with `h-cite` and JSON-LD.
