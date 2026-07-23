import { supabase, PHOTO_BUCKET } from './supabase'
import { compressImage } from './imageCompress'

// Compress + upload a photo File to Supabase Storage, return its public URL.
// folder groups uploads (e.g. 'tasks', 'attendance', 'work_board').
export async function uploadPhoto(file, folder = 'misc') {
  const blob = await compressImage(file)
  const ext = 'jpg'
  const rand = Math.round(performance.now()).toString(36) + Math.round(performance.now() * 7 % 100000).toString(36)
  const path = `${folder}/${Date.now()}_${rand}.${ext}`

  const { error } = await supabase.storage
    .from(PHOTO_BUCKET)
    .upload(path, blob, { contentType: 'image/jpeg', upsert: false })

  if (error) throw error

  const { data } = supabase.storage.from(PHOTO_BUCKET).getPublicUrl(path)
  return data.publicUrl
}

// Delete a previously-uploaded file (photo or audio) given its public URL.
// Best-effort: resolves quietly on any problem so callers never block on it.
export async function deleteStorageFile(url) {
  if (!url || typeof url !== 'string') return
  const marker = `/storage/v1/object/public/${PHOTO_BUCKET}/`
  const idx = url.indexOf(marker)
  if (idx === -1) return // not a file in our bucket — nothing to remove
  const path = decodeURIComponent(url.slice(idx + marker.length).split('?')[0])
  try {
    await supabase.storage.from(PHOTO_BUCKET).remove([path])
  } catch {
    // ignore — an orphaned file is harmless; the DB reference is already gone
  }
}

// Upload multiple photos, return array of URLs.
export async function uploadPhotos(files, folder = 'misc') {
  const urls = []
  for (const f of files) urls.push(await uploadPhoto(f, folder))
  return urls
}

// Upload a recorded audio Blob to Supabase Storage, return its public URL.
// `ext` should match the recorder's mime type (e.g. 'webm', 'mp4', 'ogg').
export async function uploadAudio(blob, folder = 'audio', ext = 'webm') {
  const rand = Math.round(performance.now()).toString(36) + Math.round(performance.now() * 7 % 100000).toString(36)
  const path = `${folder}/${Date.now()}_${rand}.${ext}`

  const { error } = await supabase.storage
    .from(PHOTO_BUCKET)
    .upload(path, blob, { contentType: blob.type || `audio/${ext}`, upsert: false })

  if (error) throw error

  const { data } = supabase.storage.from(PHOTO_BUCKET).getPublicUrl(path)
  return data.publicUrl
}
