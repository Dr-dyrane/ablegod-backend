const mongoose = require('mongoose');

const followSchema = new mongoose.Schema({
  follower_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  following_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  created_at: {
    type: Date,
    default: Date.now,
    index: true
  }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: false }
});

// Compound index to prevent duplicate follows and optimize queries
followSchema.index({ follower_id: 1, following_id: 1 }, { unique: true });

// Index for finding followers of a user
followSchema.index({ following_id: 1, created_at: -1 });

// Index for finding users that someone follows
followSchema.index({ follower_id: 1, created_at: -1 });

// Prevent self-following
followSchema.pre('save', function(next) {
  if (this.follower_id.toString() === this.following_id.toString()) {
    return next(new Error('Users cannot follow themselves'));
  }
  next();
});

// Static methods for common queries
followSchema.statics.isFollowing = async function(followerId, followingId) {
  const follow = await this.findOne({
    follower_id: followerId,
    following_id: followingId
  });
  return !!follow;
};

followSchema.statics.getFollowers = async function(userId, limit = 20, offset = 0) {
  return this.find({ following_id: userId })
    .populate('follower_id', 'username name email avatar_url')
    .sort({ created_at: -1 })
    .limit(limit)
    .skip(offset);
};

followSchema.statics.getFollowing = async function(userId, limit = 20, offset = 0) {
  return this.find({ follower_id: userId })
    .populate('following_id', 'username name email avatar_url')
    .sort({ created_at: -1 })
    .limit(limit)
    .skip(offset);
};

followSchema.statics.getFollowCounts = async function(userId) {
  const [followersCount, followingCount] = await Promise.all([
    this.countDocuments({ following_id: userId }),
    this.countDocuments({ follower_id: userId })
  ]);
  
  return { followersCount, followingCount };
};

// Instance method for getting formatted follow data
followSchema.methods.toAPIResponse = function() {
  return {
    id: this._id,
    follower_id: this.follower_id,
    following_id: this.following_id,
    created_at: this.created_at,
    created_at_formatted: this.created_at.toISOString()
  };
};

module.exports = mongoose.model('Follow', followSchema);
