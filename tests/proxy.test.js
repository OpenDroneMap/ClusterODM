// The following tests are run sequentially, and not in parallel

import fs from 'fs'
import path from 'path'
import { test, expect, describe, beforeAll } from 'vitest'

import { uuidv4 } from '../libs/utils'

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms))

const API_URL = 'http://clusterodm:3000'
const TASK_UUID = uuidv4()
console.log(`Testing CluserODM with task id: ${TASK_UUID}`)

describe('ClusterODM basic imagery processing workflow', () => {
  // Check the ClusterODM API is available before running tests
  beforeAll(async () => {
    // First, wait 3 seconds for ClusterODM --> NodeODM connection
    console.log('Waiting 3s for ClusterODM to connect --> NodeODM')
    await wait(3000)

    const maxAttempts = 10
    const delayMs = 1000

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const response = await fetch(`${API_URL}/info`)
        const json = await response.json()

        if (json.engine === 'odm') {
          console.log(`ClusterODM ready on attempt ${attempt}`)
          return
        }
      } catch (err) {
        console.warn(`Attempt ${attempt} to get /info failed:`, err)
      }

      await wait(delayMs)
    }

    throw new Error(`ClusterODM /info did not return engine=odm after ${maxAttempts} attempts`)
  }, 15_000)

  test('/options after node added', async () => {
    const response = await fetch(`${API_URL}/options`)
    const responseJson = await response.json()
    expect(responseJson).toBeDefined()
  })

  // https://github.com/OpenDroneMap/NodeODM/blob/master/docs/index.adoc#post-tasknew
  test('/task/new', async () => {
    const form = new FormData()

    const imagePaths = [
      path.resolve('./tests/data/test-photo-1.jpg'),
      path.resolve('./tests/data/test-photo-2.jpg'),
      path.resolve('./tests/data/test-photo-3.jpg'),
    ]

    for (const filePath of imagePaths) {
      try {
        const blob = await fs.openAsBlob(filePath, { type: 'image/jpeg' })
        form.append('images', blob, path.basename(filePath))
      } catch (err) {
        console.error(`Missing or unreadable file: ${filePath}`, err)
      }
    }

    // Options to reduce processing time, only generate simple ortho
    form.append('options', JSON.stringify([
      {name: 'auto-boundary', value: true},
      {name: 'fast-orthophoto', value: true},
      {name: 'pc-quality', value: 'lowest'},
      {name: 'pc-skip-geometric', value: true},
      {name: 'feature-quality', value: 'medium'},  // fails if set to lowest
      {name: 'skip-3dmodel', value: true},
      {name: 'skip-report', value: true},
      {name: 'optimize-disk-space', value: true},
    ]))

    const response = await fetch(`${API_URL}/task/new`, {
      method: 'POST',
      body: form,
      headers: {
        'set-uuid': TASK_UUID,  // Manually set the uuid to check later
      }
    })

    const responseJson = await response.json()
    expect(responseJson).not.toHaveProperty('error')
    expect(responseJson).toStrictEqual({ uuid: TASK_UUID })
  })

  // https://github.com/OpenDroneMap/NodeODM/blob/master/docs/index.adoc#get-tasklist
  test('/task/list', async () => {
    const response = await fetch(`${API_URL}/task/list`)
    const responseJson = await response.json()

    expect(responseJson).toBeDefined()
    expect(Array.isArray(responseJson)).toBe(true)

    const uuids = responseJson.map(task => task.uuid)
    expect(uuids).toContain(TASK_UUID)
  })

  // https://github.com/OpenDroneMap/NodeODM/blob/master/docs/index.adoc#get-taskuuidinfo
  test('/task/{uuid}/info check processing status', async () => {
    const Status = Object.freeze({
        QUEUED:     10,
        RUNNING:    20,
        FAILED:     30,
        COMPLETED:  40,
        CANCELLED:  50,
    });
    const StatusName = Object.fromEntries(
      Object.entries(Status).map(([k, v]) => [v, k])
    )

    const maxAttempts = 60
    const delayMs = 2000
    let responseJson
    let statusCode

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const response = await fetch(`${API_URL}/task/${TASK_UUID}/info`)
      responseJson = await response.json()
      statusCode = responseJson?.status?.code

      console.log(`Attempt ${attempt} | Status: ${StatusName[statusCode]}`)

      if (statusCode === 30) {
        throw new Error(`NodeODM processing failed: ${responseJson?.status?.errorMessage}`)
      } else if (statusCode === 40) {
        // Success
        break
      }

      if (attempt === maxAttempts) {
        throw new Error(`Task did not complete successfully after ${maxAttempts} attempts`)
      }

      await wait(delayMs)
    }

    // Optionally, validate other keys here
    expect(responseJson).toBeDefined()
    expect(statusCode).toBe(40)
  }, 60_000)

  // https://github.com/OpenDroneMap/NodeODM/blob/master/docs/index.adoc#get-taskuuiddownloadasset
  test('/task/{uuid}/download/{asset}', async () => {
    const response = await fetch(`${API_URL}/task/${TASK_UUID}/download/all.zip`);

    // Check for valid zip file
    expect(response.status).toBe(200);
    const contentType = response.headers.get('content-type');
    expect(contentType).toBe('application/zip');

    // Check zip size is larger than 0.5MB
    const buffer = await response.arrayBuffer();
    const sizeInMB = buffer.byteLength / (1024 * 1024);
    expect(sizeInMB).toBeGreaterThan(0.5);

    // Check for ZIP file signature (first 4 bytes == PK\x03\x04)
    const signature = new Uint8Array(buffer.slice(0, 4));
    const isZip = signature[0] === 0x50 && signature[1] === 0x4B && signature[2] === 0x03 && signature[3] === 0x04;
    expect(isZip).toBe(true);
  });

  // https://github.com/OpenDroneMap/NodeODM/blob/master/docs/index.adoc#post-taskremove
  test('/task/remove', async () => {
    const response = await fetch(`${API_URL}/task/remove`, {
      method: 'POST',
      body: {'uuid': TASK_UUID},
    })
    expect(response.status).toBe(200)
  })
})
