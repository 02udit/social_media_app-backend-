const { filter } = require('compression');
const express = require('express');

const awsS3 = require('../utils/awsS3');
const userModel = require('../models/userModel');
const postModel = require('../models/postModel');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');


exports.getMe = catchAsync(async (req,res,next)=>{
    res.status(200).json({
        status: 'success',
        results:1,
        data:{
            user:req.user
        }
    })
});

exports.updateMe = catchAsync(async (req,res,next)=>{

    if(req.body.password || req.body.passwordConfirm){
        return next(new AppError('This route is not for password update!',400));
    }
    const filterObj = createFilterObj(req.body,'name','email');

    const updatedUser = await userModel.findByIdAndUpdate(req.user.id,filterObj,{
        new:true,runValidators:true
    });
    
    res.status(200).json({
        status: 'success',
        data: updatedUser
    })

});

const deleteImage = (imageName)=>{
    return (new awsS3).deleteFromS3(imageName);
}

exports.deleteMe = catchAsync(async (req,res,next)=>{
    const deletedUser=await userModel.findByIdAndDelete(req.user._id);

    if(req.user.imageName!='default') await deleteImage(req.user.imageName);
    
    const userId= req.user._id;

    const postToDelete=await postModel.find({user:userId});

    allPromises=postToDelete.map(async (post)=>{
        return await deleteImage(post.imgName);
    });

    await Promise.all(allPromises);

    await postModel.deleteMany({user:userId});

    res.status(200).json({
        status: 'success',
        message: 'User deleted successfully!'
    });
});


exports.getAllUsers = async (req,res,next) => {
    const users = await userModel.find();
    res.status(200).json({
        status: 'success',
        results: users ? users.length:0,
        data: users
    });
}


exports.follow = catchAsync(async (req,res,next)=> {
    const currUser = await userModel.findById(req.user._id);

    if(!currUser) return next(new AppError('user do not exist',400));

    currUser.following.push(req.params.userId);
    await currUser.save({runValidators: false});

    res.status(200).json({
        status: 'success',
        message: 'Followed succesfully!'
    })
})
exports.unfollow = catchAsync(async (req,res,next)=> {
    const currUser = await userModel.findById(req.user._id);

    if(!currUser) return next(new AppError('user do not exist',400));
    
    currUser.following = currUser.following.filter( id => (id!=req.params.userId));

    await currUser.save({runValidators: false});

    res.status(200).json({
        status: 'success',
        message: 'removed from following'
    })
})