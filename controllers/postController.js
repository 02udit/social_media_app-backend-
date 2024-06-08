const sharp = require('sharp');


const awsS3 = require('../utils/awsS3');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const postModel = require('../models/postModel');
const commentModel = require('../models/commentModel');
const userModel = require('../models/userModel');
const { s3ImageUrlPrefix } = require('../utils/AWSCRED');


exports.createPost = catchAsync(async (req,res,next)=>{
    // img uploading

    if(!req.file) return next(new AppError('No file exist or file size too big!',400));

    const imageSream = await sharp(req.file.buffer).resize({height: 1920 , width: 1080 , fit: "contain"}).toBuffer();
    const imageName = `${req.user.email}-${Date.now()}`;

    await (new awsS3).uploadToS3(imageSream, imageName,req.file.mimetype);

    const imgUrl= s3ImageUrlPrefix + imageName;

    const {caption} = req.body;
    const post = await postModel.create({
        caption,
        photo: imgUrl,
        imgName:imageName,
        createdAt: new Date(),
        user: req.user._id,
        isSample: (req.body.isSample ? req.body.isSample:false)
    });

    res.status(201).json({
        status: 'success',
        data:{
            post
        }
    })
});

exports.deletePost = catchAsync(async (req,res,next)=>{
    
    const deletedPost=await postModel.findOneAndDelete({
        $and:[
            {
                _id:{ $eq: req.params.postId }
            },
            {
                user:{ $eq: req.user._id }
            }
        ]
    });

    if(!deletedPost) return next(new AppError('post not found or you are not allowed to delete it.',400));

    await (new awsS3).deleteFromS3(deletedPost.imgName);

    res.status(200).json({
        status: 'success',
        message: 'Deleted!'
    });

});

exports.getSamplePost = catchAsync(async (req, res,next) => {
    const post = await postModel.find({isSample: true});

    res.status(200).json({
        status: 'success',
        results: post ? post.length:0,
        data: {
            post
        }
    });
});

exports.getAllPost = catchAsync(async (req,res,next)=>{
    // 1) Get curr logged in user
    const user = await userModel.findById({_id:req.user._id});
    if(!user) return next(new AppError('No User exist!',404));

    // console.log(req.query);

    // 2) traverse all the user which curr user follow
    // let posts=[];

    const AllFollowing=user.following;

    const page=req.query?.page*1 || 1;
    const limit=req.query?.limit*1 || 100;
    const skipVal=(page-1)*limit;

    const post = await postModel.find({user:{ $in: AllFollowing }}).populate({
        path: 'user',
        select: 'id username photo'
    }).populate({
        path: 'comments.user',
        select: 'id username photo'
    }).sort('createdAt').skip(skipVal).limit(limit);


    res.status(200).json({
        status: 'success',
        results: post ? post.length:0,
        data:{
            post
        }
    });

});

exports.getMyPost = catchAsync(async (req,res,next)=>{
    const myPosts = await postModel.find({user:req.user._id});

    res.status(200).json({
        status: 'success',
        results: myPosts ? myPosts.length:0,
        data:{
            myPosts
        }
    })
});

exports.commentOnPost = catchAsync(async (req,res,next)=>{
    const post = await postModel.findOne({_id:req.params.postId});

    if(!post) return next(new AppError('No post exist!',404));

    const createdComment = await commentModel.create({
        comment:req.body.comment,
        user:req.user._id
    });

    post.comments.push(createdComment);
    await post.save({runValidator:false});

    res.status(201).json({
        status: 'success',
        data:{
            message: 'Commented succssfully!',
            comment:createdComment
        }
    })
});

exports.likePost= catchAsync(async (req,res,next) => {
    const post = await postModel.findById({_id:req.params.postId});

    if(!post) return next(new AppError('No post exist!',404));

    post.likePost();

    post.save({runValidator:false});

    res.status(200).json({
        status: 'success',
        data:{
            message:'liked the post <3'
        }
    })

});