import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Complaint, ComplaintDocument } from './complaint.model';
import { CreateComplaintDto } from './complaint.dto';

@Injectable()
export class ComplaintService {
  constructor(
    @InjectModel(Complaint.name) private readonly model: Model<ComplaintDocument>,
  ) {}

  create(dto: CreateComplaintDto) {
    const complaint = new this.model(dto);
    return complaint.save();
  }

  findAll() {
    return this.model.find().sort({ createdAt: -1 }).exec();
  }
}
