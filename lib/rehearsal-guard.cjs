'use strict';
// Intentionally committed ON. Preview environment variables cannot disable this.
const REHEARSAL = true;
// Keep incomplete checkpoints from becoming unsafe automatic Git Previews.
// Enable only after the remaining integration blockers in STATUS.md are fixed.
const PREVIEW_READY = true;
function assertPreviewReady() {
  if (!PREVIEW_READY) throw new Error('rehearsal-preview-blocked: finish browser isolation, fake QR, roles, banner and SOP before deploying');
}
const PREFIX = 'test_';

function testPath(path) {
  if (typeof path !== 'string' || !path || path.startsWith('/') || path.endsWith('/') || path.includes('//')) {
    throw new Error('rehearsal-invalid-path');
  }
  const parts = path.split('/');
  if (!parts[0].startsWith(PREFIX)) parts[0] = PREFIX + parts[0];
  return parts.join('/');
}

// The same assertion is used for direct, batched, transactional and bulk writes,
// reads of existing references, recursive deletes, and the reset tool.
function assertTestPath(ref) {
  const path = typeof ref === 'string' ? ref : ref && ref.path;
  if (typeof path !== 'string' || !/^test_[^/]+(?:\/[^/]+)*$/.test(path)) {
    throw new Error('rehearsal-production-path-blocked');
  }
  return path;
}

function assertTestQuery(query) {
  const options = query && query._queryOptions;
  const parent = options && options.parentPath && options.parentPath.relativeName;
  assertTestPath(parent ? parent + '/' + options.collectionId : options && options.collectionId);
}

const installed = new WeakSet();
function installFirestoreGuard(sdk) {
  if (installed.has(sdk)) return;
  const patch = (proto, name, before) => {
    const original = proto[name];
    if (typeof original !== 'function') return;
    proto[name] = function (...args) {
      before.call(this, args);
      return original.apply(this, args);
    };
  };
  for (const name of ['collection', 'doc']) {
    patch(sdk.Firestore.prototype, name, (args) => { args[0] = testPath(args[0]); });
  }
  // Group queries can traverse production subcollections. Unsupported until a
  // namespaced group schema is audited; never silently query the live group.
  patch(sdk.Firestore.prototype, 'collectionGroup', () => { throw new Error('rehearsal-collection-group-blocked'); });
  patch(sdk.Firestore.prototype, 'listCollections', () => { throw new Error('rehearsal-root-list-blocked'); });
  patch(sdk.Firestore.prototype, 'recursiveDelete', (args) => assertTestPath(args[0]));
  patch(sdk.Firestore.prototype, 'getAll', (args) => {
    for (const ref of args) if (ref && ref.path) assertTestPath(ref);
  });
  for (const name of ['create', 'set', 'update', 'delete', 'get', 'onSnapshot', 'collections', 'listCollections']) {
    patch(sdk.DocumentReference.prototype, name, function () { assertTestPath(this); });
  }
  for (const name of ['get', 'stream', 'onSnapshot', 'count', 'getPartitions', 'listDocuments', 'aggregate', 'explain', 'explainStream']) {
    patch(sdk.Query.prototype, name, function () {
      // Query internals are SDK-version-sensitive; unknown shapes fail closed.
      assertTestQuery(this);
    });
  }
  // Some Admin SDK versions export AggregateQuery only as a TypeScript type.
  // Derive its runtime prototype from an offline query (no credentials or I/O).
  const aggregatePrototype = new sdk.Firestore({ projectId: 'rehearsal-guard-offline' })
    .collection('test_guard_probe').count().constructor.prototype;
  for (const name of ['get', 'explain']) {
    patch(aggregatePrototype, name, function () { assertTestQuery(this._query); });
  }
  if (sdk.CollectionReference) {
    patch(sdk.CollectionReference.prototype, 'listDocuments', function () { assertTestPath(this); });
  }
  for (const Type of [sdk.WriteBatch, sdk.Transaction, sdk.BulkWriter]) {
    for (const name of ['create', 'set', 'update', 'delete', 'get']) {
      patch(Type.prototype, name, (args) => {
        // Transaction.get may receive a Query, guarded when constructed/read.
        if (args[0] instanceof sdk.Query && !(args[0] instanceof sdk.DocumentReference)) {
          assertTestQuery(args[0]);
          return;
        }
        assertTestPath(args[0]);
      });
    }
    patch(Type.prototype, 'getAll', (args) => {
      for (const ref of args) if (ref && ref.path) assertTestPath(ref);
    });
  }
  installed.add(sdk);
}

module.exports = { REHEARSAL, PREVIEW_READY, assertPreviewReady, PREFIX, testPath, assertTestPath, installFirestoreGuard };
