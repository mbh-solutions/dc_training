# Offline and account

## Know where your work is saved

| Status or message                 | Meaning and action                                                                                  |
| --------------------------------- | --------------------------------------------------------------------------------------------------- |
| **SYNCED**                        | The device has no pending sync work. This is the checkpoint before changing devices or signing out. |
| **OFFLINE · SAVED ON DEVICE**     | Saved operations are on this device. Reconnect and wait for SYNCED.                                 |
| **SYNC FAILED · SAVED ON DEVICE** | Work is retained locally. Restore connectivity and use the sync retry control.                      |
| Draft saved on this device        | Unsubmitted inputs are retained in this browser. Select SAVE & NEXT to record a performance.        |
| Draft could not be saved          | Browser storage is unavailable. Keep the workout open until you save the set.                       |

The service worker caches the app shell; IndexedDB stores the working copy and pending operations. Unsubmitted workout inputs use local storage. Offline access still requires a valid, cryptographically verified owner session. An expired session needs an online sign-in; installing the app does not remove that requirement.

## Use more than one device

Wait for **SYNCED** before moving to another device. Devices can edit, but the app does not silently merge competing offline edits. Each device submits its queued operations as one all-or-nothing batch against the cloud state it last read.

If the cloud has moved ahead or rejects a batch, editing pauses:

- **REVIEW DEVICE COPY** shows the retained device work so you can decide what to preserve.
- **NOT NOW** keeps the local queue untouched.
- **USE CLOUD DATA** replaces the device working copy with cloud data after your explicit choice. Do not select it until you have reviewed any device-only work you need.

If a client presents **CONTINUE ON THIS DEVICE**, read its warning before proceeding. It can recover access when another device is unavailable, but it cannot recover changes that never left that device.

Do not clear site data, uninstall, or reset browser storage as a first response to a sync error. A replacement device can restore synced cloud data, not unsynced entries or local drafts from a lost device.

## Account controls

Open the Home gear for **Settings**. Your signed-in email, weight unit, sign-out, and deletion controls are there. Sign-out requires an online, synced state.

For password recovery, enter your email on the sign-in page and select **FORGOT PASSWORD?** The link opens the password form; recovery revokes other sessions after the password is saved.

**DELETE ACCOUNT** requires the current password and an acknowledgement. A successful request makes cloud training data unavailable, clears local owner data on the requesting client, and revokes existing sessions. For 30 days, signing in opens the deletion-recovery screen; select **Cancel deletion** before its displayed deadline to restore access. At the deadline the scheduled database job permanently deletes the account and its related cloud data. Password recovery does not itself cancel deletion.

Source: [authentication actions](https://github.com/mbh-solutions/dc_training/blob/main/src/lib/auth-actions.ts), [offline owner verification](https://github.com/mbh-solutions/dc_training/blob/main/src/lib/offline-owner-session.ts), [sync implementation](https://github.com/mbh-solutions/dc_training/blob/main/src/offline-sync.ts).
