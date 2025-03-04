const {promisify} = require('util');
const crypto = require('crypto');
const multer = require('multer');
const jwt = require('jsonwebtoken');

const {s3ImageUrlPrefix} = require('../utils/AWSCRED');
const AwsS3 = require('../utils/awsS3');
const UserModel = require('../models/userModel');
const catchAsync = require('../utils/catchAsync');
const Email = require('../utils/email');
const AppError = require('../utils/appError');


const signToken = (id)=>{
    return jwt.sign({id},process.env.JWT_SECRET,{
        expiresIn:process.env.JWT_EXPIRES_IN
    });
};  

const createAndSendToken = (user,statusCode,res)=>{
    const token=signToken(user._id);
    const cookieOptions = {
        expiresIn: new Date(Date.now()+process.env.JWT_COOKIE_EXPIRES_IN*24*60*60*1000),
        httpOnly: true
    };
    if(process.env.NODE_ENV === 'production') cookieOptions.secure = true;
    res.cookie('jwt',token,cookieOptions);
    user.password=undefined;
    
    res.status(statusCode).json({
        status: 'success',
        token,
        data: {
            user
        }
    });
};


exports.signUp = catchAsync(async (req,res,next)=>{

    let imageUrl;
    let imageName='default';
    const defaultUrl='https://res.cloudinary.com/dtf4qywla/image/upload/v1676886183/default.png';

    if(req.file){
        if((req.file.size/1e6) > 3){
            return next(new AppError('The of image is greater than 2mb! Please select smaller image',400));
        }
        const imageSream= req.file.buffer;
        imageName = req.body.email;

        await (new AwsS3).  uploadToS3(imageSream,imageName,req.file.mimetype);
        
        imageUrl=s3ImageUrlPrefix+imageName;

    }

    const newUser = await UserModel.create({
        name: req.body.name,
        username: req.body.username,
        email: req.body.email,
        password: req.body.password,
        passwordConfirm: req.body.passwordConfirm,
        photo:imageUrl ? imageUrl: defaultUrl,
        imageName
    });

    createAndSendToken(newUser,201,res);
});

exports.protect= catchAsync(async (req,res,next)=>{
    let token;
    // 1) Getting the Token and check if it's there
    if(req.headers.authorization && req.headers.authorization.startsWith('Bearer')){
        token = req.headers.authorization.split(' ')[1];
    }
    else if(req.cookies && req.cookies.jwt){
        token=req.cookies.jwt;
    }

    if(!token){
        return next(new AppError('User not logged in!',401));
    }

    // 2) Verification of Token
    const decoded= await promisify(jwt.verify)(token,process.env.JWT_SECRET);

    // 3) Check if user still exists
    const userId=decoded.id;
    const currUser= await UserModel.findById(userId);

    if(!currUser){
        return next(new AppError('User does no longer exist!',400));
    }

    if(currUser.changedPasswordsAfter(decoded.iat)){
        return next(new AppError('Password changed! Please login again!',401));
    }

    req.user=currUser;
    next();
});



exports.login = catchAsync(async (req,res,next)=>{
    const {email,password} = req.body;
  
    if(!email || !password) {
        return next(new AppError('No email or password provided',400));
    }

    const user = await UserModel.findOne({ email }).select('+password');

    if(!user || !await user.verifyPassword(password,user.password)) {
        return next(new AppError('wrong email or password',401));
    }

    createAndSendToken(user,200,res);
});

exports.logout= (req,res)=>{
    res.clearCookie('jwt');
    res.status(200).json({status : 'succes'});
};


exports.updatePassword = catchAsync(async(req,res,next)=>{
    const {password,newPassword,newPasswordConfirm} = req.body;

    const user = await UserModel.findById(req.user.id).select('+password');
    
    if(!user){
        return next(new AppError('No user exist!',400));
    }

    if(!user.verifyPassword(password,user.password)){
        return next(new AppError('Wrong password provided!,401'));
    }

    user.password=newPassword;
    user.passwordConfirm=newPasswordConfirm
    await user.save();

    createAndSendToken(user,200,res);

});

exports.forgotPassword = catchAsync(async (req,res,next)=>{
    const email = req.body.email;
    const user = await UserModel.findOne({email});
    // console.log(email,user);
    if(!user) return next(new AppError('No user exist with provided email!',400));

    const passwordResetToken = user.createPasswordResetToken();
    await user.save({validateBeforeSave:false});

    try{
        const message=`To reset your password, use the below OPT(One Time Password). \n OTP: ${passwordResetToken}`;
        const subject='OTP for password reset(expires in 10 minutes)';
        await new Email(email,subject,message).send();

        res.status(200).json({
            status: 'success',
            data: `Email sent to ${email}. It expires in 10 mintues!`
        });
    }
    catch(err){
        user.passwordResetToken=undefined;
        user.passwordResetExpires=undefined;
        await user.save({validateBeforeSave:false});
        
        return next(new AppError('There was some problem sending email! Try again later.',500));
    }

});

exports.resetPassword = catchAsync(async (req,res,next) => {
    
    // 1) Get user based on token
    const hashedToken = crypto  
        .createHash('sha256')
        .update(req.params.token)
        .digest('hex');

    const user = await UserModel.findOne({passwordResetToken: hashedToken,passwordResetExpires : {$gt:Date.now()}});
    
    // 2) If token has not expired, and there is user, set new password
    if(!user) return next(new AppError('Token is invalid or has expired',401));
    
    user.password = req.body.password;
    user.passwordConfirm = req.body.passwordConfirm;
    user.passwordResetToken=undefined;
    user.passwordResetExpires=undefined;
    await user.save();

    // 3) Update changedPasswordAt proprty for the user
    // 4) Log the user in , send JWT
    createAndSendToken(user,200,res);
});

