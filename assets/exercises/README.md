# Exercise media

The database references images and animations here by exercise id:

```
assets/exercises/<exercise-id>.jpg
assets/exercises/<exercise-id>.gif
```

**Nothing is shipped in this folder.** No image, GIF or video URL is included
anywhere in the exercise records, and none should be added by copying from
another site — exercise demonstrations are somebody's copyrighted work, and
hotlinking them breaks the moment they move the file.

Options, in order of how well they hold up:

1. Record your own clips. A phone on a tripod is enough, and it shows *your*
   technique, which is more useful than a stock model's.
2. Buy a licensed pack, or use one released under a permissive licence, and
   drop the files in here named by id.
3. Leave it empty. Each record carries `media.videoSearch` — a search term, not
   a link — so the UI can offer a search button instead of a broken image.

The app treats a missing file as normal and shows nothing.
