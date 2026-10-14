const { createAddColumnMigration, combineNonTransactionalMigrations } = require('../../utils');

module.exports = combineNonTransactionalMigrations(
  createAddColumnMigration('posts_meta', 'event_all_day', { type: 'boolean', nullable: true }),
  createAddColumnMigration('post_revisions', 'event_details', {
    type: 'text',
    maxlength: 65535,
    nullable: true,
  }),
);
