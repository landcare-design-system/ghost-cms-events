const { createAddColumnMigration } = require('../../utils');
module.exports = createAddColumnMigration('posts_meta', 'event_booking_label', {
  type: 'string',
  maxlength: 100,
  nullable: true,
});
