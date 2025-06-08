import { Injectable } from '@nestjs/common';
import { EventEmitter } from 'events';

@Injectable()
export class AppEvents extends EventEmitter {}
