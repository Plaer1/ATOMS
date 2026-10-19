# Annotation batches

- Treat `selected-assets.jsonl` as pending feedback only, not a history of completed work. Never describe selected records as unfinished without checking their disposition.
- At the start of each review batch, snapshot its exact record fingerprints with `node tools/annotation-batch.js begin CAPTURE_DIR`. If a batch already exists, resume it; do not replace it.
- At the end of **every** batch, after fixes and verification, stop the annotator and run `node tools/annotation-batch.js finish CAPTURE_DIR`. Pass `--keep FINGERPRINT` for each unresolved or deferred note; never delete it merely to empty the queue. Notes added after the snapshot remain pending automatically.
- Verify and report the remaining pending count. Delete completed note text rather than retaining completed records, tombstones, raw-note archives, or backups. Keep only concise completion/test conclusions in focused working-note slices linked from a short index.
- Do not equate stopping the recorder with completing a batch. Do not start capture, poll Steam, or restart Steam for note cleanup.
