const { createAddColumnMigration, combineNonTransactionalMigrations } = require('../../utils');

const columns = {
  post_kind: { type: 'string', maxlength: 20, nullable: true, validations: { isIn: [['event']] } },
  event_start_at: { type: 'dateTime', nullable: true, index: true },
  event_end_at: { type: 'dateTime', nullable: true, index: true },
  event_timezone: { type: 'string', maxlength: 100, nullable: true },
  event_status: {
    type: 'string',
    maxlength: 20,
    nullable: true,
    validations: { isIn: [['confirmed', 'cancelled', 'postponed']] },
  },
  event_location: { type: 'string', maxlength: 500, nullable: true },
  event_booking_url: { type: 'string', maxlength: 2000, nullable: true },
};

module.exports = combineNonTransactionalMigrations(
  ...Object.entries(columns).map(([field, definition]) =>
    createAddColumnMigration('posts_meta', field, definition),
  ),
);
